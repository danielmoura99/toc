/**
 * Métricas e comparação entre partidas (guia §8, §9).
 *
 * Agregados por rodada só existem depois que TODAS as etapas concluíram seus
 * turnos naquela rodada (§8) — por construção: só são calculados ao ver o
 * evento da última etapa de cada rodada, nunca a meio caminho.
 */

import type { ProductionLineConfig, ProductionLineState, RunStatus, StageId } from './types';
import { REFERENCE_CAPACITY_PER_ROUND } from './types';
import { inventoryInProcess } from './engine';

export interface RoundAggregate {
  /** Zero-based — a rodada que acabou de se fechar. */
  roundIndex: number;
  deliveredCumulative: number;
  deliveredThisRound: number;
  introducedCumulative: number;
  introducedThisRound: number;
  inventoryCumulative: number;
  referenceCumulative: number;
  /** `deliveredCumulative − referenceCumulative`; pode ser negativo (§8: "inspirado no registro de Alex, incluindo valores negativos"). */
  deviationCumulative: number;
  deviationByStage: Record<StageId, number>;
}

export interface RunSummary {
  delivered: number;
  inventoryRemaining: number;
  inventoryByStage: Record<StageId, number>;
  completedRounds: number;
  /** `3,5 × completedRounds` — "referência pela capacidade média", nunca "produção garantida" (§8). */
  referenceAccumulated: number;
  deviationDelivered: number;
  /** `delivered / completedRounds`; nulo antes da primeira rodada concluída. */
  meanOutputPerRound: number | null;
  capacitySampledByStage: Record<StageId, number>;
  transferredByStage: Record<StageId, number>;
  unusedCapacityByStage: Record<StageId, number>;
  deviationByStageFinal: Record<StageId, number>;
  roundAggregates: RoundAggregate[];
}

export function summarize(config: ProductionLineConfig, state: ProductionLineState): RunSummary {
  const stageIds = config.stages.map((stage) => stage.id);
  const capacitySampledByStage: Record<StageId, number> = Object.fromEntries(stageIds.map((id) => [id, 0]));
  const transferredByStage: Record<StageId, number> = Object.fromEntries(stageIds.map((id) => [id, 0]));
  const unusedCapacityByStage: Record<StageId, number> = Object.fromEntries(stageIds.map((id) => [id, 0]));
  const turnsByStage: Record<StageId, number> = Object.fromEntries(stageIds.map((id) => [id, 0]));

  const roundAggregates: RoundAggregate[] = [];
  let previousDelivered = 0;
  let previousIntroduced = 0;

  for (const event of state.events) {
    capacitySampledByStage[event.stageId] += event.die;
    transferredByStage[event.stageId] += event.transferred;
    unusedCapacityByStage[event.stageId] += event.unusedCapacity;
    turnsByStage[event.stageId] += 1;

    const isLastStageOfRound = event.stageIndex === config.stages.length - 1;
    if (!isLastStageOfRound) continue;

    const roundNumber = event.roundIndex + 1;
    const referenceCumulative = REFERENCE_CAPACITY_PER_ROUND * roundNumber;
    const deviationByStage: Record<StageId, number> = {};
    for (const id of stageIds) {
      deviationByStage[id] = transferredByStage[id] - REFERENCE_CAPACITY_PER_ROUND * turnsByStage[id];
    }

    roundAggregates.push({
      roundIndex: event.roundIndex,
      deliveredCumulative: event.deliveredTotal,
      deliveredThisRound: event.deliveredTotal - previousDelivered,
      introducedCumulative: event.introducedTotal,
      introducedThisRound: event.introducedTotal - previousIntroduced,
      inventoryCumulative: Object.values(event.inventoryAfter).reduce((sum, value) => sum + value, 0),
      referenceCumulative,
      deviationCumulative: event.deliveredTotal - referenceCumulative,
      deviationByStage,
    });

    previousDelivered = event.deliveredTotal;
    previousIntroduced = event.introducedTotal;
  }

  const deviationByStageFinal: Record<StageId, number> = {};
  for (const id of stageIds) {
    deviationByStageFinal[id] = transferredByStage[id] - REFERENCE_CAPACITY_PER_ROUND * turnsByStage[id];
  }

  const referenceAccumulated = REFERENCE_CAPACITY_PER_ROUND * state.completedRounds;

  return {
    delivered: state.delivered,
    inventoryRemaining: inventoryInProcess(state),
    inventoryByStage: { ...state.inventoryByStage },
    completedRounds: state.completedRounds,
    referenceAccumulated,
    deviationDelivered: state.delivered - referenceAccumulated,
    meanOutputPerRound: state.completedRounds === 0 ? null : state.delivered / state.completedRounds,
    capacitySampledByStage,
    transferredByStage,
    unusedCapacityByStage,
    deviationByStageFinal,
    roundAggregates,
  };
}

/**
 * Como duas partidas se relacionam fisicamente (§9). Nomes e participantes
 * nunca entram nesta classificação (TG09): só configuração física e seed.
 */
export type RunRelationship = 'reproduction' | 'same_conditions_new_seed' | 'different_conditions';

function sameConditions(a: ProductionLineConfig, b: ProductionLineConfig): boolean {
  return (
    a.engineVersion === b.engineVersion &&
    a.rngVersion === b.rngVersion &&
    a.capacityModel === b.capacityModel &&
    a.stages.length === b.stages.length &&
    a.rounds === b.rounds
  );
}

export function classifyRunRelationship(
  a: ProductionLineConfig,
  b: ProductionLineConfig,
): RunRelationship {
  if (!sameConditions(a, b)) return 'different_conditions';
  return a.seed === b.seed ? 'reproduction' : 'same_conditions_new_seed';
}

export interface RunComparison {
  relationship: RunRelationship;
  deliveredDeltaAbs: number;
  inventoryDeltaAbs: number;
}

/**
 * Compara duas partidas já resumidas. Não calcula percentual de melhoria: o
 * guia proíbe atribuir a diferença a aprendizado quando a seed muda (§9) e
 * proíbe percentual de melhoria controlada quando etapas/horizonte mudam —
 * como este exercício não tem estratégia ajustável durante a partida (§3:
 * "fora desta entrega"), a única leitura segura é a diferença bruta, nunca
 * um "ganho".
 */
export function compareRuns(
  reference: { config: ProductionLineConfig; summary: RunSummary },
  current: { config: ProductionLineConfig; summary: RunSummary },
): RunComparison {
  return {
    relationship: classifyRunRelationship(reference.config, current.config),
    deliveredDeltaAbs: current.summary.delivered - reference.summary.delivered,
    inventoryDeltaAbs: current.summary.inventoryRemaining - reference.summary.inventoryRemaining,
  };
}

export function runStatusLabel(status: RunStatus): string {
  return status === 'completed' ? 'Concluída' : 'Em andamento';
}
