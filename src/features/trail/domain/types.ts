/**
 * Contratos do domínio do Simulador da Trilha.
 *
 * Este módulo é TypeScript puro: não importa React, PixiJS nem APIs de
 * navegador. O motor é a única fonte de verdade para posições e resultados.
 */

/** Versão do motor. Mudar ao alterar fórmula, RNG, passo ou semântica de métricas. */
export const ENGINE_VERSION = '1.0.0';

/** Passo fixo de simulação, em segundos. */
export const TICK_SEC = 1;

/** Duração do bloco de variabilidade, em segundos. */
export const VARIABILITY_BLOCK_SEC = 30;

/** Tolerância para comparações numéricas internas, em metros. */
export const EPSILON_M = 1e-9;

/** Multiplicador que deriva a carga máxima a partir da carga de referência. */
export const MAX_LOAD_FACTOR = 3;

/** Coeficiente de penalidade por carga na fórmula de velocidade. */
export const LOAD_PENALTY_COEFFICIENT = 0.2;

export type CharacterId = string;
export type ItemId = string;

export interface CharacterDefinition {
  id: CharacterId;
  displayName: string;
  baseSpeedKmh: number;
  referenceLoadKg: number;
  /** Sempre MAX_LOAD_FACTOR × referenceLoadKg. Derivado ao construir o cenário. */
  maxLoadKg: number;
  /** Variação relativa do ritmo, entre 0 e 0,5. */
  variability: number;
}

export interface SupplyItem {
  id: ItemId;
  label: string;
  weightKg: number;
}

export interface Scenario {
  id: string;
  revision: number;
  distanceM: number;
  timeLimitSec: number;
  variabilityBlockSec: typeof VARIABILITY_BLOCK_SEC;
  characters: CharacterDefinition[];
  items: SupplyItem[];
  /** Da frente para trás. */
  initialOrder: CharacterId[];
  initialOwnerByItem: Record<ItemId, CharacterId>;
  defaultSeed: string;
}

export type GuidedStage = 1 | 2 | 3;

export interface AttemptConfig {
  engineVersion: string;
  /** Snapshot completo do cenário, sem referência mutável compartilhada. */
  scenario: Scenario;
  seed: string;
  /** Da frente para trás. */
  order: CharacterId[];
  ownerByItem: Record<ItemId, CharacterId>;
  participantByCharacter: Partial<Record<CharacterId, string>>;
  hypothesis: string;
  guidedStage: GuidedStage;
  tickSec: typeof TICK_SEC;
}

export interface CharacterState {
  id: CharacterId;
  positionM: number;
  /** Velocidade que o personagem poderia usar no tick, sem a restrição da fila. */
  availableSpeedMps: number;
  /** Velocidade realmente observada no tick (avanço / dt). */
  actualSpeedMps: number;
  arrivalTimeSec: number | null;
  /** Tempo em que avançou menos do que sua capacidade por causa de quem está à frente. */
  limitedTimeSec: number;
  /** Subconjunto de limitedTimeSec em que o avanço foi praticamente nulo. */
  stoppedByQueueTimeSec: number;
  /** Diagnóstico auxiliar: tempo equivalente perdido por limitação. */
  equivalentLostTimeSec: number;
}

export type SimulationStatus = 'running' | 'completed' | 'timed_out';

export interface SimulationState {
  elapsedSec: number;
  characters: Record<CharacterId, CharacterState>;
  maxSpreadM: number;
  sumSpreadM: number;
  ticksExecuted: number;
  status: SimulationStatus;
}

export type AttemptOutcome = 'completed' | 'timed_out';

export interface ResultMetrics {
  outcome: AttemptOutcome;
  /** Tempo do último a chegar. Nulo em timeout. */
  totalTimeSec: number | null;
  /** min(posições) / distância × 100. */
  collectiveProgressPct: number;
  maxSpreadM: number;
  meanSpreadM: number;
  arrivalByCharacter: Record<CharacterId, number | null>;
  limitedTimeByCharacter: Record<CharacterId, number>;
  stoppedByQueueTimeByCharacter: Record<CharacterId, number>;
  equivalentLostTimeByCharacter: Record<CharacterId, number>;
  loadKgByCharacter: Record<CharacterId, number>;
}

export interface AttemptResult {
  id: string;
  /** Metadado; nunca participa da física. */
  createdAt: string;
  config: AttemptConfig;
  outcome: AttemptOutcome;
  finalState: SimulationState;
  totalTimeSec: number | null;
  meanSpreadM: number;
  metrics: ResultMetrics;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
