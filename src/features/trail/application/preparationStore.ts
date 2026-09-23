/**
 * Store da preparação.
 *
 * Guarda a expedição corrente (o `Scenario` em jogo — gerado ou um dos fixos
 * preservados como referência de teste), a etapa e a configuração em edição.
 * O estado por tick da simulação NÃO passa por aqui: ele vive no controlador
 * da execução, para que nenhum quadro da animação dispare uma renderização
 * do React.
 *
 * O cenário e a etapa são independentes um do outro: trocar de etapa não
 * troca de expedição, só reconstrói o rascunho a partir da MESMA expedição
 * nas condições que aquela etapa permite. Isso é diferente da primeira
 * versão do MVP, em que cada etapa apontava para um cenário fixo
 * (`scenarioId`) — ver `docs/decisions.md`.
 *
 * A configuração em edição é sempre um objeto separado do snapshot de uma
 * tentativa concluída (R12): editar a preparação nunca altera um resultado
 * já registrado.
 */

import { create } from 'zustand';

import { createAttemptConfig, transferItems } from '../domain/attempt';
import { DEFAULT_FATIGUE_PARAMS } from '../domain/fatigue';
import type {
  AttemptConfig,
  AttemptResult,
  CharacterId,
  FatigueMode,
  FatigueParams,
  GuidedStage,
  ItemId,
  Scenario,
} from '../domain/types';
import { SCENARIO_A } from '../scenarios';
import { allKnownAttempts, hasCompletedFirstStage, useAttemptsStore } from './attemptsStore';
import { HYPOTHESIS_MAX_LENGTH, getStage } from './stages';

/**
 * Verdadeiro se a etapa pode ser acessada agora. A etapa 1 está sempre
 * acessível (é onde toda expedição começa); as etapas 2 e 3 exigem uma
 * conclusão da etapa 1 desta MESMA expedição no histórico — ver
 * `hasCompletedFirstStage`. Usado tanto pela store (`setStage`, a garantia
 * de verdade) quanto pela UI (`Preparation`, para desabilitar os botões e
 * explicar por quê) — as duas camadas de verificação já estabelecidas para
 * as outras permissões de etapa (`canReorder`/`canRedistribute`).
 */
export function canAccessStage(
  stage: GuidedStage,
  expedition: Scenario,
  history: AttemptResult[],
  pendingAttempt: AttemptResult | null,
): boolean {
  if (stage === 1) return true;
  return hasCompletedFirstStage(allKnownAttempts(history, pendingAttempt), expedition.id);
}

export interface RestoreDraftSnapshot {
  scenario: Scenario;
  guidedStage: GuidedStage;
  seed: string;
  order: CharacterId[];
  ownerByItem: Record<ItemId, CharacterId>;
  participantByCharacter: Partial<Record<CharacterId, string>>;
  hypothesis: string;
  fatigueMode: FatigueMode;
  fatigueParams: FatigueParams;
}

interface PreparationState {
  /**
   * A expedição corrente. Antes de `startExpedition` ser chamada pela
   * primeira vez nesta sessão, aponta para o cenário A só como valor inicial
   * inofensivo — a tela de preparação não é mostrada nesse meio-tempo
   * (`TrailExperience` mostra a configuração de grupo primeiro).
   */
  expedition: Scenario;
  stage: GuidedStage;
  /** Configuração em edição. Vira snapshot imutável ao iniciar a execução. */
  draft: AttemptConfig;

  /**
   * Define uma nova expedição — gerada ou um dos cenários fixos — e volta
   * para a etapa 1, bloqueada (§ nova entrega: "reiniciar a primeira
   * caminhada não deve sortear outra configuração nem liberar alterações";
   * isso vale desde a criação: a etapa 1 começa sempre travada).
   */
  startExpedition: (scenario: Scenario, participantByCharacter?: Partial<Record<CharacterId, string>>) => void;
  setStage: (stage: GuidedStage) => void;
  moveCharacter: (characterId: CharacterId, direction: -1 | 1) => void;
  setOrder: (order: CharacterId[]) => void;
  moveItems: (itemIds: ItemId[], toCharacterId: CharacterId) => void;
  setParticipant: (characterId: CharacterId, name: string) => void;
  setHypothesis: (hypothesis: string) => void;
  /**
   * Ativação explícita de fadiga para a tentativa em preparação (§7.3) — só
   * depois da primeira conclusão desta expedição, igual à condição que já
   * libera as etapas 2 e 3. Sempre com os parâmetros padrão do modelo — não
   * há edição de coeficientes na UI (§7.2).
   */
  setFatigueMode: (mode: FatigueMode) => void;
  resetDraft: () => void;
  /**
   * Restaura a preparação a partir de uma sessão importada ou recuperada do
   * localStorage. O chamador já validou a reconstrução com `validateConfig`
   * antes de chamar isto — aqui só se aplica o que já se sabe ser válido.
   */
  restoreDraft: (snapshot: RestoreDraftSnapshot) => void;
}

function draftForStage(
  scenario: Scenario,
  stage: GuidedStage,
  participantByCharacter: Partial<Record<CharacterId, string>>,
): AttemptConfig {
  return createAttemptConfig(scenario, { guidedStage: stage, participantByCharacter });
}

export const usePreparationStore = create<PreparationState>((set) => ({
  expedition: SCENARIO_A,
  stage: 1,
  draft: draftForStage(SCENARIO_A, 1, {}),

  startExpedition: (scenario, participantByCharacter = {}) =>
    set({
      expedition: scenario,
      stage: 1,
      draft: draftForStage(scenario, 1, participantByCharacter),
    }),

  // Trocar de etapa reconstrói a ordem e as mochilas a partir da expedição —
  // "trocar de etapa descarta as edições anteriores" já era o comportamento
  // antes desta mudança (ver decisions.md) — mas preserva quem representa
  // cada personagem: nomes de participantes identificam pessoas ao longo de
  // toda a expedição, não são uma decisão "sob teste" que a etapa reinicia.
  //
  // Ir para a etapa 2 ou 3 exige uma conclusão da etapa 1 desta expedição no
  // histórico (`canAccessStage`) — sem isso, a chamada não faz nada. Igual às
  // outras permissões de etapa, a checagem mora aqui, não só num `disabled`
  // na UI: um botão desabilitado impede o clique, mas sem esta segunda
  // camada qualquer outro caminho até `setStage` contornaria a regra.
  setStage: (stage) =>
    set((state) => {
      const { history, pendingAttempt } = useAttemptsStore.getState();
      if (!canAccessStage(stage, state.expedition, history, pendingAttempt)) return state;

      return {
        stage,
        draft: draftForStage(state.expedition, stage, state.draft.participantByCharacter),
      };
    }),

  /**
   * Alternativa por teclado à ordenação por arrastar e soltar (AC12).
   *
   * A permissão da etapa é verificada aqui, na store — não só nos componentes
   * que desabilitam o controle visualmente. Um `disabled` na UI evita o
   * clique; sem essa segunda checagem, qualquer outro caminho até a ação (um
   * atalho futuro, um teste, o console) contornaria a regra sem que nada
   * reclamasse. As duas camadas continuam existindo por razões diferentes: a
   * UI desabilitada é o que o grupo vê; a store é o que garante a regra de
   * verdade.
   */
  moveCharacter: (characterId, direction) =>
    set((state) => {
      if (!getStage(state.stage).canReorder) return state;

      const order = [...state.draft.order];
      const from = order.indexOf(characterId);
      const to = from + direction;

      if (from === -1 || to < 0 || to >= order.length) return state;

      [order[from], order[to]] = [order[to], order[from]];
      return { draft: { ...state.draft, order } };
    }),

  setOrder: (order) =>
    set((state) => {
      if (!getStage(state.stage).canReorder) return state;
      return { draft: { ...state.draft, order: [...order] } };
    }),

  moveItems: (itemIds, toCharacterId) =>
    set((state) => {
      if (!getStage(state.stage).canRedistribute) return state;
      if (itemIds.length === 0) return state;
      return { draft: transferItems(state.draft, itemIds, toCharacterId) };
    }),

  setParticipant: (characterId, name) =>
    set((state) => {
      const participantByCharacter = { ...state.draft.participantByCharacter };
      const trimmed = name.trim();

      if (trimmed === '') {
        delete participantByCharacter[characterId];
      } else {
        participantByCharacter[characterId] = trimmed;
      }

      return { draft: { ...state.draft, participantByCharacter } };
    }),

  setHypothesis: (hypothesis) =>
    set((state) => ({
      draft: { ...state.draft, hypothesis: hypothesis.slice(0, HYPOTHESIS_MAX_LENGTH) },
    })),

  // Mesma checagem de `canAccessStage`, na store — não só num `disabled` na
  // UI (o padrão de duas camadas de sempre). "O padrão de toda nova
  // tentativa continua desligado" (§7.3) é automático: `draftForStage`
  // reconstrói o rascunho via `createAttemptConfig` sem passar `fatigueMode`,
  // que então assume 'disabled' — a mesma reconstrução que já zera hipótese,
  // ordem e carga a cada troca de etapa ou nova expedição.
  setFatigueMode: (mode) =>
    set((state) => {
      const { history, pendingAttempt } = useAttemptsStore.getState();
      if (!hasCompletedFirstStage(allKnownAttempts(history, pendingAttempt), state.expedition.id)) return state;

      return {
        draft: { ...state.draft, fatigueMode: mode, fatigueParams: DEFAULT_FATIGUE_PARAMS },
      };
    }),

  // Restaura ordem e mochilas ao ponto de partida da etapa — mas, como em
  // `setStage`, os nomes dos participantes não são "configuração sob teste" e
  // continuam preservados.
  resetDraft: () =>
    set((state) => ({
      draft: draftForStage(state.expedition, state.stage, state.draft.participantByCharacter),
    })),

  restoreDraft: (snapshot) => {
    const draft = createAttemptConfig(snapshot.scenario, {
      seed: snapshot.seed,
      order: snapshot.order,
      ownerByItem: snapshot.ownerByItem,
      participantByCharacter: snapshot.participantByCharacter,
      hypothesis: snapshot.hypothesis,
      guidedStage: snapshot.guidedStage,
      fatigueMode: snapshot.fatigueMode,
      fatigueParams: snapshot.fatigueParams,
    });

    set({ expedition: snapshot.scenario, stage: snapshot.guidedStage, draft });
  },
}));
