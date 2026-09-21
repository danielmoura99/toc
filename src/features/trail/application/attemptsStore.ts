/**
 * Histórico de tentativas concluídas.
 *
 * Guarda até 20 resultados (§12) e a seleção corrente para comparação (até 3,
 * §8.2). Ao atingir 20, a aplicação recusa novas gravações e pede exclusão
 * seletiva — mas isso não pode significar perder o resultado que acabou de
 * ser calculado: `pendingAttempt` guarda essa tentativa concluída-mas-não-
 * -gravada até haver espaço (ou até o operador decidir descartá-la de forma
 * explícita). Só existe uma pendente por vez: a preparação bloqueia iniciar
 * uma nova tentativa enquanto essa não for resolvida, então nunca há uma
 * segunda disputando o mesmo lugar.
 *
 * A primeira execução concluída da etapa 1 vira a referência inicial (§4.1).
 * Isso é só uma pré-seleção de conveniência para a tela de comparação — o
 * domínio (`compareAttempts`) não sabe o que é "referência"; qualquer par de
 * tentativas pode ser comparado.
 */

import { create } from 'zustand';

import { finalizeResult } from '../domain/metrics';
import type { AttemptConfig, AttemptResult, SimulationState } from '../domain/types';

export const MAX_HISTORY_SIZE = 20;
export const MAX_COMPARISON_SELECTION = 3;

function createAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Alternativa determinística o suficiente para uma sessão só: não precisa
  // resistir a colisão entre dispositivos, só ser única nesta lista.
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type RecordAttemptResult =
  | { ok: true; attempt: AttemptResult; becameReference: boolean }
  | { ok: false; reason: 'history_full'; attempt: AttemptResult };

interface CommitOutcome {
  history: AttemptResult[];
  referenceAttemptId: string | null;
  becameReference: boolean;
}

/** Decide a referência (se ainda não há uma) e acrescenta ao histórico. */
function commitToHistory(
  history: AttemptResult[],
  referenceAttemptId: string | null,
  attempt: AttemptResult,
): CommitOutcome {
  const becameReference =
    referenceAttemptId === null && attempt.config.guidedStage === 1 && attempt.outcome === 'completed';

  return {
    history: [...history, attempt],
    referenceAttemptId: becameReference ? attempt.id : referenceAttemptId,
    becameReference,
  };
}

interface AttemptsState {
  /** Mais antiga primeiro — ordem de conclusão. */
  history: AttemptResult[];
  referenceAttemptId: string | null;
  selectedForComparison: string[];
  /**
   * Tentativa concluída que não coube no histórico (20/20) e ainda não foi
   * salva nem descartada. Sobrevive à desmontagem da tela de execução — não é
   * um estado de componente, é a única forma de garantir que nada some ao
   * navegar para o histórico liberar espaço.
   */
  pendingAttempt: AttemptResult | null;

  recordAttempt: (config: AttemptConfig, finalState: SimulationState) => RecordAttemptResult;
  removeAttempt: (id: string) => void;
  toggleComparisonSelection: (id: string) => void;
  clearComparisonSelection: () => void;
  setReferenceAttempt: (id: string) => void;
  /** Descarte explícito e informado — não é o mesmo que perder silenciosamente. */
  discardPendingAttempt: () => void;
  /**
   * Substitui o histórico inteiro por um já validado (recuperado do
   * localStorage ou de uma importação). Não faz merge com o que já existe —
   * "substituir os dados locais existentes" é a operação que a tela de
   * importação confirma explicitamente com o operador antes de chamar isto.
   * Uma tentativa pendente trazida junto é aplicada imediatamente, se houver
   * espaço, ou preservada como pendente, se não houver.
   */
  hydrateHistory: (
    history: AttemptResult[],
    referenceAttemptId: string | null,
    pendingAttempt?: AttemptResult | null,
  ) => void;
}

export const useAttemptsStore = create<AttemptsState>((set, get) => ({
  history: [],
  referenceAttemptId: null,
  selectedForComparison: [],
  pendingAttempt: null,

  recordAttempt: (config, finalState) => {
    const { history, referenceAttemptId } = get();
    const metrics = finalizeResult(config, finalState);
    const attempt: AttemptResult = {
      id: createAttemptId(),
      createdAt: new Date().toISOString(),
      config,
      outcome: metrics.outcome,
      finalState,
      totalTimeSec: metrics.totalTimeSec,
      meanSpreadM: metrics.meanSpreadM,
      metrics,
    };

    if (history.length >= MAX_HISTORY_SIZE) {
      // Não descarta: fica pendente até o operador abrir espaço ou descartar
      // de forma explícita (§12 — "não descartar silenciosamente").
      set({ pendingAttempt: attempt });
      return { ok: false, reason: 'history_full', attempt };
    }

    const outcome = commitToHistory(history, referenceAttemptId, attempt);
    set({ history: outcome.history, referenceAttemptId: outcome.referenceAttemptId });

    return { ok: true, attempt, becameReference: outcome.becameReference };
  },

  removeAttempt: (id) =>
    set((state) => {
      const history = state.history.filter((attempt) => attempt.id !== id);
      const referenceAttemptId = state.referenceAttemptId === id ? null : state.referenceAttemptId;
      const selectedForComparison = state.selectedForComparison.filter((selectedId) => selectedId !== id);

      // Excluir abre espaço: se havia uma tentativa pendente, ela entra agora,
      // sem exigir uma ação manual separada do operador.
      if (state.pendingAttempt && history.length < MAX_HISTORY_SIZE) {
        const committed = commitToHistory(history, referenceAttemptId, state.pendingAttempt);
        return {
          history: committed.history,
          referenceAttemptId: committed.referenceAttemptId,
          selectedForComparison,
          pendingAttempt: null,
        };
      }

      return { history, referenceAttemptId, selectedForComparison };
    }),

  toggleComparisonSelection: (id) =>
    set((state) => {
      const isSelected = state.selectedForComparison.includes(id);

      if (isSelected) {
        return { selectedForComparison: state.selectedForComparison.filter((sel) => sel !== id) };
      }

      if (state.selectedForComparison.length >= MAX_COMPARISON_SELECTION) {
        // Limite de 3: a mais antiga da seleção sai para a nova entrar.
        return { selectedForComparison: [...state.selectedForComparison.slice(1), id] };
      }

      return { selectedForComparison: [...state.selectedForComparison, id] };
    }),

  clearComparisonSelection: () => set({ selectedForComparison: [] }),

  setReferenceAttempt: (id) => set({ referenceAttemptId: id }),

  discardPendingAttempt: () => set({ pendingAttempt: null }),

  hydrateHistory: (history, referenceAttemptId, pendingAttempt = null) => {
    if (pendingAttempt && history.length < MAX_HISTORY_SIZE) {
      const committed = commitToHistory(history, referenceAttemptId, pendingAttempt);
      set({
        history: committed.history,
        referenceAttemptId: committed.referenceAttemptId,
        selectedForComparison: [],
        pendingAttempt: null,
      });
      return;
    }

    set({ history, referenceAttemptId, selectedForComparison: [], pendingAttempt: pendingAttempt ?? null });
  },
}));
