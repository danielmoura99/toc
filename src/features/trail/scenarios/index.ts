/**
 * Cenários versionados do MVP.
 *
 * Os parâmetros numéricos são valores iniciais de projeto, sujeitos a
 * calibração. Não foram extraídos do livro nem representam fisiologia validada.
 * Ao alterar qualquer dado aqui, incrementar `revision`.
 */

import type { Scenario } from '../domain/types';
import { buildScenario, type ScenarioSpec } from './builder';

const DISTANCE_M = 3000;
const TIME_LIMIT_SEC = 14400;
const VARIABILITY = 0.2;

/** Cenário A — Trilha inicial. A restrição é p5, sobrecarregado no teto. */
const SCENARIO_A_SPEC: ScenarioSpec = {
  id: 'trilha-a',
  revision: 1,
  distanceM: DISTANCE_M,
  timeLimitSec: TIME_LIMIT_SEC,
  defaultSeed: 'trilha-a-001',
  characters: [
    { id: 'p1', displayName: 'Caminhante 1', baseSpeedKmh: 4.8, referenceLoadKg: 12, variability: VARIABILITY },
    { id: 'p2', displayName: 'Caminhante 2', baseSpeedKmh: 4.6, referenceLoadKg: 12, variability: VARIABILITY },
    { id: 'p3', displayName: 'Caminhante 3', baseSpeedKmh: 5.0, referenceLoadKg: 14, variability: VARIABILITY },
    { id: 'p4', displayName: 'Caminhante 4', baseSpeedKmh: 4.7, referenceLoadKg: 10, variability: VARIABILITY },
    { id: 'p5', displayName: 'Caminhante 5', baseSpeedKmh: 4.5, referenceLoadKg: 6, variability: VARIABILITY },
    { id: 'p6', displayName: 'Caminhante 6', baseSpeedKmh: 4.9, referenceLoadKg: 12, variability: VARIABILITY },
  ],
  initialOrder: ['p1', 'p2', 'p5', 'p3', 'p4', 'p6'],
  initialLoadKgByCharacter: { p1: 6, p2: 6, p3: 6, p4: 6, p5: 18, p6: 6 },
};

/**
 * Cenário B — Transferência de aprendizado.
 *
 * Mesma distância, velocidades, variabilidade e total de 48 kg. A restrição se
 * desloca para p2, e p5 é aliviado. Existe para impedir que a equipe memorize
 * um nome ou uma posição como solução.
 */
const SCENARIO_B_SPEC: ScenarioSpec = {
  id: 'trilha-b',
  revision: 1,
  distanceM: DISTANCE_M,
  timeLimitSec: TIME_LIMIT_SEC,
  defaultSeed: 'trilha-b-001',
  characters: [
    { id: 'p1', displayName: 'Caminhante 1', baseSpeedKmh: 4.8, referenceLoadKg: 12, variability: VARIABILITY },
    { id: 'p2', displayName: 'Caminhante 2', baseSpeedKmh: 4.6, referenceLoadKg: 6, variability: VARIABILITY },
    { id: 'p3', displayName: 'Caminhante 3', baseSpeedKmh: 5.0, referenceLoadKg: 14, variability: VARIABILITY },
    { id: 'p4', displayName: 'Caminhante 4', baseSpeedKmh: 4.7, referenceLoadKg: 10, variability: VARIABILITY },
    { id: 'p5', displayName: 'Caminhante 5', baseSpeedKmh: 4.5, referenceLoadKg: 12, variability: VARIABILITY },
    { id: 'p6', displayName: 'Caminhante 6', baseSpeedKmh: 4.9, referenceLoadKg: 12, variability: VARIABILITY },
  ],
  initialOrder: ['p3', 'p1', 'p4', 'p2', 'p6', 'p5'],
  initialLoadKgByCharacter: { p1: 6, p2: 18, p3: 6, p4: 6, p5: 6, p6: 6 },
};

export const SCENARIO_A: Scenario = buildScenario(SCENARIO_A_SPEC);
export const SCENARIO_B: Scenario = buildScenario(SCENARIO_B_SPEC);

export const SCENARIOS: Record<string, Scenario> = {
  [SCENARIO_A.id]: SCENARIO_A,
  [SCENARIO_B.id]: SCENARIO_B,
};

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(`Cenário desconhecido: ${id}`);
  }
  return scenario;
}

/**
 * Rótulo curto para mostrar na interface. Os dois cenários fixos (mantidos
 * como referência de teste, não mais como entrada direta do MVP) continuam
 * com o nome que o grupo já reconhece; qualquer outro id — toda expedição
 * gerada — aparece como "Expedição gerada", sem tentar decorar o id técnico.
 */
export function scenarioDisplayLabel(scenarioId: string): string {
  if (scenarioId === SCENARIO_A.id) return 'Cenário A';
  if (scenarioId === SCENARIO_B.id) return 'Cenário B';
  return 'Expedição gerada';
}

export { buildScenario, deriveMaxLoadKg, snapshotScenario } from './builder';
export type { CharacterSpec, ScenarioSpec } from './builder';
export {
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  MAX_GENERATION_ATTEMPTS,
  generateExpedition,
  buildCandidateSpec,
  buildReserveSpec,
  evaluateGeneratedScenario,
  EXPEDITION_INITIAL_STAGE,
  type GeneratedExpedition,
  type ScenarioCheckResult,
} from './generator';
export {
  STRATEGIES,
  effectiveSpeedKmh,
  reorderSlowestFirst,
  redistributeFromBottleneck,
  overloadFastest,
  type Strategy,
  type StrategyId,
} from './strategies';
