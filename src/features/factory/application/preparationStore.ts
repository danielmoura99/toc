/**
 * Store da preparação da fábrica.
 *
 * Mais simples que a da trilha: não há etapas guiadas nem redistribuição —
 * só quantidade de setores, participantes, horizonte, hipótese e previsão
 * (§7 "Preparação"). Toda partida iniciada pela preparação recebe uma seed
 * nova (`newRunConfig`, §5: "gerar uma seed ao criar uma nova partida") —
 * senão cada partida repetiria exatamente os mesmos dados. Só "Repetir os
 * mesmos sorteios", na tela de resultado, reaproveita a seed de propósito.
 */

import { create } from 'zustand';

import { createProductionLineConfig, type CreateProductionLineConfigOptions } from '../domain/config';
import { HYPOTHESIS_MAX_LENGTH } from '../domain/validation';
import type { Horizon, ProductionLineConfig, StageId } from '../domain/types';

export interface RestoreDraftSnapshot {
  config: ProductionLineConfig;
  prediction: number | null;
}

interface PreparationState {
  draft: ProductionLineConfig;
  /** Previsão do grupo de lotes expedidos, registrada antes de iniciar (§7). Nula até responderem. */
  prediction: number | null;

  setStageCount: (stageCount: number) => void;
  setRounds: (rounds: Horizon) => void;
  setParticipantName: (stageId: StageId, name: string) => void;
  setHypothesis: (hypothesis: string) => void;
  setPrediction: (prediction: number | null) => void;
  /** "Nova sequência de dados" (§5): mesmos participantes, posições e horizonte, seed nova. */
  rerollSeed: () => void;
  /** Sorteia uma seed nova para o rascunho e devolve a configuração com que a partida vai começar. */
  newRunConfig: () => ProductionLineConfig;
  /** "Nova partida" (§5): rascunho inteiramente novo, seed nova, sem participantes herdados. */
  resetDraft: () => void;
  restoreDraft: (snapshot: RestoreDraftSnapshot) => void;
}

function rebuildPreservingParticipants(
  current: ProductionLineConfig,
  changes: Partial<Pick<CreateProductionLineConfigOptions, 'stageCount' | 'rounds' | 'hypothesis'>>,
): ProductionLineConfig {
  const stageCount = changes.stageCount ?? current.stages.length;
  const participantNameByStage: Partial<Record<StageId, string>> = {};
  for (let index = 0; index < Math.min(stageCount, current.stages.length); index += 1) {
    const stage = current.stages[index];
    if (stage.participantName) participantNameByStage[stage.id] = stage.participantName;
  }

  return createProductionLineConfig({
    stageCount,
    rounds: changes.rounds ?? current.rounds,
    hypothesis: changes.hypothesis ?? current.hypothesis,
    seed: current.seed,
    participantNameByStage,
  });
}

export const usePreparationStore = create<PreparationState>((set, get) => ({
  draft: createProductionLineConfig(),
  prediction: null,

  setStageCount: (stageCount) =>
    set((state) => ({ draft: rebuildPreservingParticipants(state.draft, { stageCount }) })),

  setRounds: (rounds) => set((state) => ({ draft: rebuildPreservingParticipants(state.draft, { rounds }) })),

  setParticipantName: (stageId, name) =>
    set((state) => ({
      draft: {
        ...state.draft,
        stages: state.draft.stages.map((stage) =>
          stage.id === stageId ? { ...stage, participantName: name.trim().slice(0, 40) } : stage,
        ),
      },
    })),

  setHypothesis: (hypothesis) =>
    set((state) => ({ draft: { ...state.draft, hypothesis: hypothesis.slice(0, HYPOTHESIS_MAX_LENGTH) } })),

  setPrediction: (prediction) => set({ prediction }),

  rerollSeed: () =>
    set((state) => ({
      draft: createProductionLineConfig({
        stageCount: state.draft.stages.length,
        rounds: state.draft.rounds,
        hypothesis: state.draft.hypothesis,
        participantNameByStage: Object.fromEntries(
          state.draft.stages.map((stage) => [stage.id, stage.participantName]),
        ),
      }),
    })),

  newRunConfig: () => {
    get().rerollSeed();
    return get().draft;
  },

  resetDraft: () => set({ draft: createProductionLineConfig(), prediction: null }),

  restoreDraft: (snapshot) => set({ draft: snapshot.config, prediction: snapshot.prediction }),
}));
