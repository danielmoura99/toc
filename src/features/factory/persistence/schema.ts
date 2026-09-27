/**
 * Contrato do payload de sessão persistida da Fábrica de componentes (guia
 * §9, §10). Independente da persistência da trilha: chave própria, schema
 * próprio (TG12 — "trilha e fábrica mantêm sessões separadas").
 *
 * Zod valida a forma — presença de campos, tipos primitivos — para que um
 * JSON arbitrário nunca derrube a aplicação. A validade física (conservação,
 * limites de transferência) é responsabilidade exclusiva do motor
 * (`stepTurn`/`runToEnd`): este módulo não duplica aquela regra, só garante
 * que o formato é seguro para inspecionar e recomputar.
 */

import { z } from 'zod';

import { runToEnd, stepTurn, createInitialState } from '../domain/engine';
import { summarize } from '../domain/metrics';
import { ENGINE_VERSION, MAX_STAGE_COUNT, MIN_STAGE_COUNT } from '../domain/types';
import { validateConfig } from '../domain/validation';

/**
 * Versão do formato do payload. Mudar exige uma rotina de migração explícita
 * — este MVP não migra automaticamente entre formatos; uma sessão de versão
 * diferente é rejeitada com mensagem clara em vez de aplicada quebrada ou
 * apagada (mesma política adotada pela trilha).
 */
export const SCHEMA_VERSION = 1;

function oldFormatIssue(foundVersion: number): string {
  return (
    `Esta sessão foi salva num formato anterior (schemaVersion ${foundVersion}) — este MVP não migra ` +
    'automaticamente entre formatos. Exporte-a antes de atualizar, se quiser guardá-la; ela continua no ' +
    'navegador, intacta, até você decidir descartá-la.'
  );
}

/** Chave própria — nunca compartilhada com a sessão da trilha (TG12). */
export const STORAGE_KEY = 'factory-mvp:session:v1';

/** Limite de tamanho para um arquivo importado (§9). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const StageIdSchema = z.string().min(1);

const StageDefinitionSchema = z.object({
  id: StageIdSchema,
  sectorName: z.string(),
  participantName: z.string(),
});

const HorizonSchema = z.union([z.literal(10), z.literal(20), z.literal(30)]);

export const ProductionLineConfigSchema = z.object({
  engineVersion: z.string(),
  rngVersion: z.string(),
  seed: z.string(),
  stages: z.array(StageDefinitionSchema).min(MIN_STAGE_COUNT).max(MAX_STAGE_COUNT),
  rounds: HorizonSchema,
  hypothesis: z.string(),
  initialInventory: z.literal('empty'),
  capacityModel: z.literal('fair-d6'),
});

const TurnEventSchema = z.object({
  roundIndex: z.number().int().min(0),
  stageIndex: z.number().int().min(0),
  stageId: StageIdSchema,
  die: z.number().int().min(1).max(6),
  availableBefore: z.number().nullable(),
  transferred: z.number(),
  unusedCapacity: z.number(),
  inventoryAfter: z.record(StageIdSchema, z.number()),
  introducedTotal: z.number(),
  deliveredTotal: z.number(),
});

const ProductionLineStateSchema = z.object({
  nextRoundIndex: z.number().int().min(0),
  nextStageIndex: z.number().int().min(0),
  completedRounds: z.number().int().min(0),
  inventoryByStage: z.record(StageIdSchema, z.number()),
  introduced: z.number(),
  delivered: z.number(),
  events: z.array(TurnEventSchema),
  status: z.enum(['active', 'completed']),
});

const RoundAggregateSchema = z.object({
  roundIndex: z.number(),
  deliveredCumulative: z.number(),
  deliveredThisRound: z.number(),
  introducedCumulative: z.number(),
  introducedThisRound: z.number(),
  inventoryCumulative: z.number(),
  referenceCumulative: z.number(),
  deviationCumulative: z.number(),
  deviationByStage: z.record(StageIdSchema, z.number()),
});

const RunSummarySchema = z.object({
  delivered: z.number(),
  inventoryRemaining: z.number(),
  inventoryByStage: z.record(StageIdSchema, z.number()),
  completedRounds: z.number(),
  referenceAccumulated: z.number(),
  deviationDelivered: z.number(),
  meanOutputPerRound: z.number().nullable(),
  capacitySampledByStage: z.record(StageIdSchema, z.number()),
  transferredByStage: z.record(StageIdSchema, z.number()),
  unusedCapacityByStage: z.record(StageIdSchema, z.number()),
  deviationByStageFinal: z.record(StageIdSchema, z.number()),
  roundAggregates: z.array(RoundAggregateSchema),
});

const RunResultSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  config: ProductionLineConfigSchema,
  finalState: ProductionLineStateSchema,
  summary: RunSummarySchema,
});

const PreparationSnapshotSchema = z.object({
  config: ProductionLineConfigSchema,
  /** Previsão do grupo de lotes expedidos, registrada antes de iniciar (§7). */
  prediction: z.number().nullable(),
});

const ActiveRunSchema = z.object({
  config: ProductionLineConfigSchema,
  state: ProductionLineStateSchema,
});

export const SessionPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engineVersion: z.string(),
  savedAt: z.string(),
  preparation: PreparationSnapshotSchema,
  history: z.array(RunResultSchema).max(20),
  /** Partida concluída que não coube no histórico (20/20) — mesmo padrão da trilha. */
  pendingRun: RunResultSchema.nullable(),
  /**
   * Partida em andamento (não concluída) — ao contrário da trilha, este
   * exercício PRECISA recuperar uma execução ativa após recarregar, sempre
   * pausada, sem repetir o último turno confirmado (§9, TG07). Nula quando
   * não há partida em andamento.
   */
  activeRun: ActiveRunSchema.nullable(),
});

export type ProductionLineConfigPayload = z.infer<typeof ProductionLineConfigSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export type PreparationSnapshot = z.infer<typeof PreparationSnapshotSchema>;
export type ActiveRun = z.infer<typeof ActiveRunSchema>;
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export interface PayloadValidation {
  ok: boolean;
  payload: SessionPayload | null;
  issues: string[];
}

/** Igualdade profunda, indiferente à ordem das chaves (mesmo utilitário da trilha). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

/**
 * Recomputa `state` jogando `state.events.length` turnos a partir do estado
 * inicial da mesma config e compara. `stepTurn` é determinístico (seed, sem
 * `Math.random`/`Date.now`), então serve tanto para uma partida concluída
 * (`RunResult.finalState`) quanto para uma em andamento (`ActiveRun.state`)
 * — a mesma checagem que a trilha usa para detectar adulteração manual.
 */
function recomputeState(config: z.infer<typeof ProductionLineConfigSchema>, turns: number) {
  let state = createInitialState(config);
  for (let i = 0; i < turns; i += 1) {
    state = stepTurn(config, state);
  }
  return state;
}

function runResultIssues(run: z.infer<typeof RunResultSchema>): string[] {
  if (run.finalState.status !== 'completed') {
    return [`Partida "${run.id}": estado final marcado como em andamento — uma partida registrada precisa ter terminado.`];
  }

  let recomputed;
  try {
    recomputed = runToEnd(run.config);
  } catch (error) {
    return [
      `Partida "${run.id}": não foi possível recalcular o resultado para conferência. ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }

  if (!deepEqual(recomputed, run.finalState)) {
    return [
      `Partida "${run.id}": o estado final gravado não corresponde ao que o motor produz para essa configuração e seed.`,
    ];
  }

  const recomputedSummary = summarize(run.config, recomputed);
  if (!deepEqual(recomputedSummary, run.summary)) {
    return [`Partida "${run.id}": as métricas gravadas não batem com as recalculadas.`];
  }

  return [];
}

function activeRunIssues(active: z.infer<typeof ActiveRunSchema>): string[] {
  if (active.state.status === 'completed') {
    return ['A partida em andamento salva já está marcada como concluída — isso deveria estar no histórico, não em `activeRun`.'];
  }

  let recomputed;
  try {
    recomputed = recomputeState(active.config, active.state.events.length);
  } catch (error) {
    return [`Partida em andamento: não foi possível recalcular o estado salvo. ${error instanceof Error ? error.message : String(error)}`];
  }

  if (!deepEqual(recomputed, active.state)) {
    return ['Partida em andamento: o estado salvo não corresponde ao que o motor produz para essa configuração e seed.'];
  }

  return [];
}

export function validateSessionPayload(raw: unknown): PayloadValidation {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    typeof (raw as { schemaVersion?: unknown }).schemaVersion === 'number' &&
    (raw as { schemaVersion: number }).schemaVersion !== SCHEMA_VERSION
  ) {
    return { ok: false, payload: null, issues: [oldFormatIssue((raw as { schemaVersion: number }).schemaVersion)] };
  }

  const parsed = SessionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      payload: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
    };
  }

  const payload = parsed.data;
  const issues: string[] = [];

  if (payload.engineVersion !== ENGINE_VERSION) {
    issues.push(
      `Versão do motor incompatível: sessão salva com ${payload.engineVersion}, versão atual é ${ENGINE_VERSION}.`,
    );
    return { ok: false, payload, issues };
  }

  const prepConfigResult = validateConfig(payload.preparation.config);
  if (!prepConfigResult.valid) {
    issues.push(`Preparação salva inválida: ${prepConfigResult.issues.map((i) => i.message).join(' ')}`);
  }

  for (const run of payload.history) {
    const result = validateConfig(run.config);
    if (!result.valid) {
      issues.push(`Partida "${run.id}" inválida: ${result.issues.map((i) => i.message).join(' ')}`);
      continue;
    }
    issues.push(...runResultIssues(run));
  }

  if (payload.pendingRun) {
    const result = validateConfig(payload.pendingRun.config);
    if (!result.valid) {
      issues.push(`Partida pendente "${payload.pendingRun.id}" inválida: ${result.issues.map((i) => i.message).join(' ')}`);
    } else {
      issues.push(...runResultIssues(payload.pendingRun));
    }
  }

  if (payload.activeRun) {
    const result = validateConfig(payload.activeRun.config);
    if (!result.valid) {
      issues.push(`Partida em andamento inválida: ${result.issues.map((i) => i.message).join(' ')}`);
    } else {
      issues.push(...activeRunIssues(payload.activeRun));
    }
  }

  return { ok: issues.length === 0, payload, issues };
}
