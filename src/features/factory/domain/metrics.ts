/**
 * Métricas e comparação entre partidas (guia §8, §9; evolução "Restrição e
 * fluxo" §8).
 *
 * Agregados por rodada só existem depois que TODAS as etapas concluíram seus
 * turnos naquela rodada (§8) — por construção: só são calculados ao ver o
 * evento da última etapa de cada rodada, nunca a meio caminho.
 *
 * A referência é a menor capacidade média configurada × dias encerrados. Na
 * experiência antiga todas as médias são 3,5, então o valor é o mesmo de
 * antes; na nova, muda com o perfil e com a melhoria testada.
 */

import type { ProductionLineConfig, ProductionLineState, RunStatus, StageId, TurnEvent } from './types';
import { inventoryInProcess } from './engine';
import { diagnoseConstraint } from './capacity';

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
  /** Menor capacidade média configurada, em lotes/dia — 3,5 na experiência antiga. */
  referenceRatePerRound: number;
  /** `referenceRatePerRound × completedRounds` — nunca "produção garantida" (§8). */
  referenceAccumulated: number;
  deviationDelivered: number;
  /** Taxa de entrega: expedidos até o último dia encerrado / dias encerrados; nula antes do primeiro fechamento. */
  meanOutputPerRound: number | null;
  nominalMeanByStage: Record<StageId, number>;
  /** Soma da capacidade disponível (`dado + bônus + melhoria`) — igual à soma dos dados na experiência antiga. */
  capacitySampledByStage: Record<StageId, number>;
  transferredByStage: Record<StageId, number>;
  /** Soma de `capacidade disponível − transferido`. */
  unusedCapacityByStage: Record<StageId, number>;
  /** Jogadas com material disponível menor que a capacidade (excluída a fonte irrestrita). */
  insufficientMaterialTurnsByStage: Record<StageId, number>;
  /** Processado / capacidade disponível, entre 0 e 1; nulo antes da primeira jogada do setor. */
  utilizationByStage: Record<StageId, number | null>;
  deviationByStageFinal: Record<StageId, number>;
  roundAggregates: RoundAggregate[];
}

/** Material insuficiente para aproveitar toda a capacidade (§7) — nunca na fonte irrestrita. */
export function hadInsufficientMaterial(event: TurnEvent): boolean {
  return event.availableBefore !== null && event.availableBefore < event.availableCapacity;
}

export function summarize(config: ProductionLineConfig, state: ProductionLineState): RunSummary {
  const stageIds = config.stages.map((stage) => stage.id);
  const zeros = () => Object.fromEntries(stageIds.map((id) => [id, 0])) as Record<StageId, number>;
  const capacitySampledByStage = zeros();
  const transferredByStage = zeros();
  const unusedCapacityByStage = zeros();
  const insufficientMaterialTurnsByStage = zeros();
  const turnsByStage = zeros();

  const { meanByStage, minMean } = diagnoseConstraint(config);
  const deviationOf = (id: StageId) => transferredByStage[id] - meanByStage[id] * turnsByStage[id];

  const roundAggregates: RoundAggregate[] = [];
  let previousDelivered = 0;
  let previousIntroduced = 0;

  for (const event of state.events) {
    capacitySampledByStage[event.stageId] += event.availableCapacity;
    transferredByStage[event.stageId] += event.transferred;
    unusedCapacityByStage[event.stageId] += event.unusedCapacity;
    if (hadInsufficientMaterial(event)) insufficientMaterialTurnsByStage[event.stageId] += 1;
    turnsByStage[event.stageId] += 1;

    const isLastStageOfRound = event.stageIndex === config.stages.length - 1;
    if (!isLastStageOfRound) continue;

    const referenceCumulative = minMean * (event.roundIndex + 1);
    roundAggregates.push({
      roundIndex: event.roundIndex,
      deliveredCumulative: event.deliveredTotal,
      deliveredThisRound: event.deliveredTotal - previousDelivered,
      introducedCumulative: event.introducedTotal,
      introducedThisRound: event.introducedTotal - previousIntroduced,
      inventoryCumulative: Object.values(event.inventoryAfter).reduce((sum, value) => sum + value, 0),
      referenceCumulative,
      deviationCumulative: event.deliveredTotal - referenceCumulative,
      deviationByStage: Object.fromEntries(stageIds.map((id) => [id, deviationOf(id)])),
    });

    previousDelivered = event.deliveredTotal;
    previousIntroduced = event.introducedTotal;
  }

  const lastClosed = roundAggregates.at(-1);
  const referenceAccumulated = minMean * state.completedRounds;

  return {
    delivered: state.delivered,
    inventoryRemaining: inventoryInProcess(state),
    inventoryByStage: { ...state.inventoryByStage },
    completedRounds: state.completedRounds,
    referenceRatePerRound: minMean,
    referenceAccumulated,
    deviationDelivered: state.delivered - referenceAccumulated,
    // Calculada do último fechamento — entregas de um dia parcial nunca entram (§8).
    meanOutputPerRound: lastClosed ? lastClosed.deliveredCumulative / (lastClosed.roundIndex + 1) : null,
    nominalMeanByStage: meanByStage,
    capacitySampledByStage,
    transferredByStage,
    unusedCapacityByStage,
    insufficientMaterialTurnsByStage,
    utilizationByStage: Object.fromEntries(
      stageIds.map((id) => [id, capacitySampledByStage[id] === 0 ? null : transferredByStage[id] / capacitySampledByStage[id]]),
    ),
    deviationByStageFinal: Object.fromEntries(stageIds.map((id) => [id, deviationOf(id)])),
    roundAggregates,
  };
}

/**
 * Como duas partidas se relacionam fisicamente (§9; evolução §5 e §11.8).
 * Nomes e participantes nunca entram nesta classificação (TG09).
 */
export type RunRelationship =
  | 'reproduction'
  | 'controlled_intervention'
  | 'same_conditions_new_seed'
  | 'different_conditions';

interface ComparableRun {
  config: ProductionLineConfig;
  finalState: ProductionLineState;
}

function sameBaseConditions(a: ProductionLineConfig, b: ProductionLineConfig): boolean {
  return (
    a.engineVersion === b.engineVersion &&
    a.rngVersion === b.rngVersion &&
    a.capacityModel === b.capacityModel &&
    a.capacityModelVersion === b.capacityModelVersion &&
    a.experience === b.experience &&
    a.stages.length === b.stages.length &&
    a.stages.every((stage, index) => stage.id === b.stages[index].id) &&
    a.rounds === b.rounds &&
    a.capacityProfiles.every((profile, index) => profile.baseBonus === b.capacityProfiles[index]?.baseBonus)
  );
}

function sameUpgrades(a: ProductionLineConfig, b: ProductionLineConfig): boolean {
  return a.capacityProfiles.every((profile, index) => profile.upgrade === b.capacityProfiles[index]?.upgrade);
}

/** As faces correspondentes (mesmo setor, mesmo dia) são idênticas nas duas partidas. */
export function sameDiceSequence(a: ProductionLineState, b: ProductionLineState): boolean {
  const length = Math.min(a.events.length, b.events.length);
  for (let i = 0; i < length; i += 1) {
    if (a.events[i].stageId !== b.events[i].stageId || a.events[i].die !== b.events[i].die) return false;
  }
  return true;
}

export function classifyRunRelationship(a: ComparableRun, b: ComparableRun): RunRelationship {
  if (!sameBaseConditions(a.config, b.config)) return 'different_conditions';
  if (a.config.seed !== b.config.seed) return 'same_conditions_new_seed';
  if (sameUpgrades(a.config, b.config)) return 'reproduction';
  // Mesma seed, só a melhoria muda: comparação controlada — desde que os
  // dados realmente coincidam, o que a chave do RNG deveria garantir.
  return sameDiceSequence(a.finalState, b.finalState) ? 'controlled_intervention' : 'different_conditions';
}

export interface RunComparison {
  relationship: RunRelationship;
  deliveredDeltaAbs: number;
  inventoryDeltaAbs: number;
}

/**
 * Compara duas partidas já resumidas. Não calcula percentual de melhoria: a
 * leitura segura é a diferença bruta de entrega e de estoque (§9; evolução §8.1:
 * "a principal evidência é entrega real e sua diferença").
 */
export function compareRuns(
  reference: ComparableRun & { summary: RunSummary },
  current: ComparableRun & { summary: RunSummary },
): RunComparison {
  return {
    relationship: classifyRunRelationship(reference, current),
    deliveredDeltaAbs: current.summary.delivered - reference.summary.delivered,
    inventoryDeltaAbs: current.summary.inventoryRemaining - reference.summary.inventoryRemaining,
  };
}

export function runStatusLabel(status: RunStatus): string {
  return status === 'completed' ? 'Concluída' : 'Em andamento';
}
