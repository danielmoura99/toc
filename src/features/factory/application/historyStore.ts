/**
 * Histórico de partidas concluídas da fábrica.
 *
 * Mais simples que o da trilha: não há noção de "referência inicial" — o
 * guia (§9) só pede comparar até três partidas, sem pré-seleção automática.
 * Guarda até 20 resultados (§9); ao atingir o limite, uma partida concluída
 * fica pendente até haver espaço ou descarte explícito — nunca some
 * silenciosamente.
 */

import { create } from 'zustand';

import { summarize } from '../domain/metrics';
import type { ProductionLineConfig, ProductionLineState } from '../domain/types';
import type { ConstraintGuess, RunResult } from '../persistence/schema';

export const MAX_HISTORY_SIZE = 20;
export const MAX_COMPARISON_SELECTION = 3;

function createRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type RecordRunOutcome =
  | { ok: true; run: RunResult }
  | { ok: false; reason: 'history_full'; run: RunResult };

interface HistoryState {
  /** Mais antiga primeiro — ordem de conclusão. */
  history: RunResult[];
  selectedForComparison: string[];
  /** Partida concluída que não coube no histórico (20/20), ainda não salva nem descartada. */
  pendingRun: RunResult | null;

  recordRun: (config: ProductionLineConfig, finalState: ProductionLineState) => RecordRunOutcome;
  removeRun: (id: string) => void;
  toggleComparisonSelection: (id: string) => void;
  clearComparisonSelection: () => void;
  discardPendingRun: () => void;
  hydrateHistory: (history: RunResult[], pendingRun?: RunResult | null) => void;
  /** Hipótese do grupo sobre a restrição (§6.1), registrada na linha de base — no histórico ou pendente. */
  setConstraintGuess: (runId: string, guess: Omit<ConstraintGuess, 'answeredAt'>) => void;
}

function appendToHistory(history: RunResult[], run: RunResult): RunResult[] {
  return [...history, run];
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  history: [],
  selectedForComparison: [],
  pendingRun: null,

  recordRun: (config, finalState) => {
    const { history, pendingRun } = get();
    if (pendingRun) throw new Error('Libere espaço para a partida pendente antes de registrar outra.');
    const run: RunResult = {
      id: createRunId(),
      createdAt: new Date().toISOString(),
      config: structuredClone(config),
      finalState: structuredClone(finalState),
      summary: summarize(config, finalState),
      constraintGuess: null,
    };

    if (history.length >= MAX_HISTORY_SIZE) {
      set({ pendingRun: run });
      return { ok: false, reason: 'history_full', run };
    }

    set({ history: appendToHistory(history, run) });
    return { ok: true, run };
  },

  removeRun: (id) =>
    set((state) => {
      const history = state.history.filter((run) => run.id !== id);
      const selectedForComparison = state.selectedForComparison.filter((selectedId) => selectedId !== id);

      if (state.pendingRun && history.length < MAX_HISTORY_SIZE) {
        return {
          history: appendToHistory(history, state.pendingRun),
          selectedForComparison,
          pendingRun: null,
        };
      }

      return { history, selectedForComparison };
    }),

  toggleComparisonSelection: (id) =>
    set((state) => {
      const isSelected = state.selectedForComparison.includes(id);
      if (isSelected) {
        return { selectedForComparison: state.selectedForComparison.filter((sel) => sel !== id) };
      }
      if (state.selectedForComparison.length >= MAX_COMPARISON_SELECTION) {
        return { selectedForComparison: [...state.selectedForComparison.slice(1), id] };
      }
      return { selectedForComparison: [...state.selectedForComparison, id] };
    }),

  clearComparisonSelection: () => set({ selectedForComparison: [] }),

  discardPendingRun: () => set({ pendingRun: null }),

  hydrateHistory: (history, pendingRun = null) => {
    if (pendingRun && history.length < MAX_HISTORY_SIZE) {
      set({ history: appendToHistory(history, pendingRun), selectedForComparison: [], pendingRun: null });
      return;
    }
    set({ history, selectedForComparison: [], pendingRun: pendingRun ?? null });
  },

  setConstraintGuess: (runId, guess) =>
    set((state) => {
      const answered: ConstraintGuess = {
        stageId: guess.stageId,
        justification: guess.justification.slice(0, 500),
        answeredAt: new Date().toISOString(),
      };
      const apply = (run: RunResult): RunResult => (run.id === runId ? { ...run, constraintGuess: answered } : run);
      return {
        history: state.history.map(apply),
        pendingRun: state.pendingRun ? apply(state.pendingRun) : null,
      };
    }),
}));
