/**
 * Métricas e comparação entre tentativas.
 *
 * O tempo total é o objetivo principal. Dispersão e limitação explicam o
 * resultado: não existe pontuação composta que esconda o conflito entre eles.
 */

import type {
  AttemptConfig,
  AttemptResult,
  CharacterId,
  ResultMetrics,
  SimulationState,
} from './types';
import { computeLoadByCharacter } from './engine';

/** Dispersão instantânea: max(posições) - min(posições), em metros. */
export function currentSpreadM(state: SimulationState, order: CharacterId[]): number {
  const positions = order.map((characterId) => state.characters[characterId].positionM);
  return Math.max(...positions) - Math.min(...positions);
}

/** Progresso coletivo: posição do último dividida pela distância total. */
export function collectiveProgressPct(
  state: SimulationState,
  order: CharacterId[],
  distanceM: number,
): number {
  const positions = order.map((characterId) => state.characters[characterId].positionM);
  return (Math.min(...positions) / distanceM) * 100;
}

/** Dispersão média ao longo dos ticks executados. */
export function meanSpreadM(state: SimulationState): number {
  return state.ticksExecuted === 0 ? 0 : state.sumSpreadM / state.ticksExecuted;
}

export function finalizeResult(config: AttemptConfig, state: SimulationState): ResultMetrics {
  if (state.status === 'running') {
    throw new Error('finalizeResult exige uma execução encerrada.');
  }

  const arrivalByCharacter: Record<CharacterId, number | null> = {};
  const limitedTimeByCharacter: Record<CharacterId, number> = {};
  const stoppedByQueueTimeByCharacter: Record<CharacterId, number> = {};
  const equivalentLostTimeByCharacter: Record<CharacterId, number> = {};

  for (const characterId of config.order) {
    const character = state.characters[characterId];
    arrivalByCharacter[characterId] = character.arrivalTimeSec;
    limitedTimeByCharacter[characterId] = character.limitedTimeSec;
    stoppedByQueueTimeByCharacter[characterId] = character.stoppedByQueueTimeSec;
    equivalentLostTimeByCharacter[characterId] = character.equivalentLostTimeSec;
  }

  const outcome = state.status;
  const arrivals = config.order.map((id) => state.characters[id].arrivalTimeSec);

  // Tempo total existe apenas quando todos chegam. Em timeout não se inventa
  // um tempo de conclusão: mostra-se o progresso alcançado.
  const totalTimeSec =
    outcome === 'completed' ? Math.max(...arrivals.map((value) => value ?? 0)) : null;

  return {
    outcome,
    totalTimeSec,
    collectiveProgressPct: collectiveProgressPct(state, config.order, config.scenario.distanceM),
    maxSpreadM: state.maxSpreadM,
    meanSpreadM: meanSpreadM(state),
    arrivalByCharacter,
    limitedTimeByCharacter,
    stoppedByQueueTimeByCharacter,
    equivalentLostTimeByCharacter,
    loadKgByCharacter: computeLoadByCharacter(config),
  };
}

/** Motivo pelo qual duas tentativas não são comparáveis de forma controlada. */
export type ComparabilityIssue =
  | 'engine_version'
  | 'scenario'
  | 'scenario_revision'
  | 'seed'
  | 'cast'
  | 'items'
  | 'distance'
  | 'tick'
  | 'variability_block';

export interface ComparisonResult {
  comparable: boolean;
  issues: ComparabilityIssue[];
  /** Diferenças de configuração, sempre explicitadas ao facilitador. */
  changes: {
    orderChanged: boolean;
    loadChanged: boolean;
    referenceOrder: CharacterId[];
    currentOrder: CharacterId[];
    loadDeltaKgByCharacter: Record<CharacterId, number>;
  };
  /** Só existe quando ambas concluíram e são comparáveis. */
  improvementPct: number | null;
  totalTimeDeltaSec: number | null;
  maxSpreadDeltaM: number | null;
}

function sameCast(a: AttemptConfig, b: AttemptConfig): boolean {
  const castA = [...a.scenario.characters].sort((x, y) => x.id.localeCompare(y.id));
  const castB = [...b.scenario.characters].sort((x, y) => x.id.localeCompare(y.id));

  if (castA.length !== castB.length) return false;

  return castA.every((character, index) => {
    const other = castB[index];
    return (
      character.id === other.id &&
      character.baseSpeedKmh === other.baseSpeedKmh &&
      character.referenceLoadKg === other.referenceLoadKg &&
      character.maxLoadKg === other.maxLoadKg &&
      character.variability === other.variability
    );
  });
}

function sameItems(a: AttemptConfig, b: AttemptConfig): boolean {
  const idsA = a.scenario.items.map((item) => `${item.id}:${item.weightKg}`).sort();
  const idsB = b.scenario.items.map((item) => `${item.id}:${item.weightKg}`).sort();
  return idsA.length === idsB.length && idsA.every((value, index) => value === idsB[index]);
}

/**
 * Compara duas tentativas. `reference` é a referência; `current` é a tentativa
 * avaliada. Ordem e dono dos itens podem mudar — o resto precisa ser igual.
 */
export function compareAttempts(
  reference: AttemptResult,
  current: AttemptResult,
): ComparisonResult {
  const issues: ComparabilityIssue[] = [];
  const a = reference.config;
  const b = current.config;

  if (a.engineVersion !== b.engineVersion) issues.push('engine_version');
  if (a.scenario.id !== b.scenario.id) issues.push('scenario');
  if (a.scenario.revision !== b.scenario.revision) issues.push('scenario_revision');
  if (a.seed !== b.seed) issues.push('seed');
  if (!sameCast(a, b)) issues.push('cast');
  if (!sameItems(a, b)) issues.push('items');
  if (a.scenario.distanceM !== b.scenario.distanceM) issues.push('distance');
  if (a.tickSec !== b.tickSec) issues.push('tick');
  if (a.scenario.variabilityBlockSec !== b.scenario.variabilityBlockSec) {
    issues.push('variability_block');
  }

  const comparable = issues.length === 0;

  const loadA = computeLoadByCharacter(a);
  const loadB = computeLoadByCharacter(b);
  const loadDeltaKgByCharacter: Record<CharacterId, number> = {};
  let loadChanged = false;

  for (const characterId of Object.keys(loadA)) {
    const delta = (loadB[characterId] ?? 0) - (loadA[characterId] ?? 0);
    loadDeltaKgByCharacter[characterId] = delta;
    if (delta !== 0) loadChanged = true;
  }

  const orderChanged = a.order.join(',') !== b.order.join(',');

  const bothCompleted = reference.totalTimeSec !== null && current.totalTimeSec !== null;
  const canScore = comparable && bothCompleted;

  const improvementPct =
    canScore && reference.totalTimeSec
      ? ((reference.totalTimeSec - current.totalTimeSec!) / reference.totalTimeSec) * 100
      : null;

  return {
    comparable,
    issues,
    changes: {
      orderChanged,
      loadChanged,
      referenceOrder: [...a.order],
      currentOrder: [...b.order],
      loadDeltaKgByCharacter,
    },
    improvementPct,
    totalTimeDeltaSec: canScore ? current.totalTimeSec! - reference.totalTimeSec! : null,
    maxSpreadDeltaM: comparable ? current.metrics.maxSpreadM - reference.metrics.maxSpreadM : null,
  };
}
