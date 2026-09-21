/**
 * Contrato do payload de sessão persistida (§12).
 *
 * Zod valida a forma dos dados — presença de campos, tipos primitivos — para
 * que um JSON arbitrário nunca derrube a aplicação. A validade física de cada
 * tentativa (cargas dentro do limite, ordem completa, etc.) continua sendo
 * responsabilidade exclusiva de `validateConfig`, no domínio: este módulo não
 * duplica aquela regra, só garante que o formato é seguro para inspecionar.
 */

import { z } from 'zod';

import { runToEnd } from '../domain/engine';
import { finalizeResult } from '../domain/metrics';
import { ENGINE_VERSION } from '../domain/types';
import { validateConfig } from '../domain/validation';

/**
 * Versão do formato do payload. Mudar exige uma rotina de migração explícita.
 *
 * v2 (expedições geradas): `preparation` passou a carregar o próprio
 * `scenario` em vez de depender de `guidedStage` apontar para um cenário fixo
 * — uma expedição sorteada não tem um `scenarioId` conhecido de antemão para
 * a etapa procurar. Uma sessão v1 salva antes desta mudança é rejeitada com
 * mensagem específica (ver `OLD_FORMAT_ISSUE`) em vez de aplicada quebrada ou
 * apagada — nenhuma migração automática existe para essa troca de formato.
 */
export const SCHEMA_VERSION = 2;

const PREVIOUS_SCHEMA_VERSION = 1;

export const OLD_FORMAT_ISSUE =
  `Esta sessão foi salva num formato anterior (schemaVersion ${PREVIOUS_SCHEMA_VERSION}), de antes da ` +
  'expedição gerada — este MVP não migra automaticamente entre formatos. Exporte-a antes de atualizar, ' +
  'se quiser guardá-la; ela continua no navegador, intacta, até você decidir descartá-la.';

/** Chave sugerida pelo guia, já versionada no próprio nome. */
export const STORAGE_KEY = 'trail-mvp:session:v1';

/** Limite de tamanho para um arquivo importado (§12). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const CharacterIdSchema = z.string().min(1);
const ItemIdSchema = z.string().min(1);

const CharacterDefinitionSchema = z.object({
  id: CharacterIdSchema,
  displayName: z.string(),
  baseSpeedKmh: z.number(),
  referenceLoadKg: z.number(),
  maxLoadKg: z.number(),
  variability: z.number(),
});

const SupplyItemSchema = z.object({
  id: ItemIdSchema,
  label: z.string(),
  weightKg: z.number(),
});

const ScenarioSchema = z.object({
  id: z.string(),
  revision: z.number(),
  distanceM: z.number(),
  timeLimitSec: z.number(),
  variabilityBlockSec: z.literal(30),
  characters: z.array(CharacterDefinitionSchema),
  items: z.array(SupplyItemSchema),
  initialOrder: z.array(CharacterIdSchema),
  initialOwnerByItem: z.record(ItemIdSchema, CharacterIdSchema),
  defaultSeed: z.string(),
});

const GuidedStageSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const AttemptConfigSchema = z.object({
  engineVersion: z.string(),
  scenario: ScenarioSchema,
  seed: z.string(),
  order: z.array(CharacterIdSchema),
  ownerByItem: z.record(ItemIdSchema, CharacterIdSchema),
  // Opcional por valor: espelha Partial<Record<CharacterId, string>> do domínio.
  participantByCharacter: z.record(CharacterIdSchema, z.string().optional()),
  hypothesis: z.string(),
  guidedStage: GuidedStageSchema,
  tickSec: z.literal(1),
});

const CharacterStateSchema = z.object({
  id: CharacterIdSchema,
  positionM: z.number(),
  availableSpeedMps: z.number(),
  actualSpeedMps: z.number(),
  arrivalTimeSec: z.number().nullable(),
  limitedTimeSec: z.number(),
  stoppedByQueueTimeSec: z.number(),
  equivalentLostTimeSec: z.number(),
});

const SimulationStatusSchema = z.enum(['running', 'completed', 'timed_out']);

const SimulationStateSchema = z.object({
  elapsedSec: z.number(),
  characters: z.record(CharacterIdSchema, CharacterStateSchema),
  maxSpreadM: z.number(),
  sumSpreadM: z.number(),
  ticksExecuted: z.number(),
  status: SimulationStatusSchema,
});

const AttemptOutcomeSchema = z.enum(['completed', 'timed_out']);

const ResultMetricsSchema = z.object({
  outcome: AttemptOutcomeSchema,
  totalTimeSec: z.number().nullable(),
  collectiveProgressPct: z.number(),
  maxSpreadM: z.number(),
  meanSpreadM: z.number(),
  arrivalByCharacter: z.record(CharacterIdSchema, z.number().nullable()),
  limitedTimeByCharacter: z.record(CharacterIdSchema, z.number()),
  stoppedByQueueTimeByCharacter: z.record(CharacterIdSchema, z.number()),
  equivalentLostTimeByCharacter: z.record(CharacterIdSchema, z.number()),
  loadKgByCharacter: z.record(CharacterIdSchema, z.number()),
});

const AttemptResultSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  config: AttemptConfigSchema,
  outcome: AttemptOutcomeSchema,
  finalState: SimulationStateSchema,
  totalTimeSec: z.number().nullable(),
  meanSpreadM: z.number(),
  metrics: ResultMetricsSchema,
});

const PreparationSnapshotSchema = z.object({
  // Snapshot completo, igual ao de cada tentativa no histórico — a
  // preparação não depende mais de a etapa apontar para um cenário fixo.
  scenario: ScenarioSchema,
  guidedStage: GuidedStageSchema,
  seed: z.string(),
  order: z.array(CharacterIdSchema),
  ownerByItem: z.record(ItemIdSchema, CharacterIdSchema),
  // Opcional por valor: espelha Partial<Record<CharacterId, string>> do domínio.
  participantByCharacter: z.record(CharacterIdSchema, z.string().optional()),
  hypothesis: z.string(),
});

export const SessionPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engineVersion: z.string(),
  savedAt: z.string(),
  preparation: PreparationSnapshotSchema,
  history: z.array(AttemptResultSchema).max(20),
  referenceAttemptId: z.string().nullable(),
  /**
   * Tentativa concluída que não coube no histórico (20/20) no momento em que
   * a sessão foi salva. Sem este campo, ela desapareceria ao recarregar a
   * página ou ao exportar a sessão — exatamente a perda que a store existe
   * para evitar (ver `attemptsStore.pendingAttempt`).
   */
  pendingAttempt: AttemptResultSchema.nullable(),
});

export type PreparationSnapshot = z.infer<typeof PreparationSnapshotSchema>;
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

/**
 * Resultado de validar um payload desconhecido: `shapeValid` diz se os campos
 * batem estruturalmente; `engineCompatible` diz se a versão do motor bate com
 * a instalada. Um payload de outra versão do motor é estruturalmente válido,
 * mas rejeitado no MVP (§12: "rejeitar com mensagem clara").
 */
export interface PayloadValidation {
  ok: boolean;
  payload: SessionPayload | null;
  issues: string[];
}

/**
 * Igualdade profunda, indiferente à ordem das chaves. `JSON.stringify` não
 * serve aqui: dois objetos com os mesmos campos em ordem diferente (comum
 * depois de passar por outra ferramenta, ou editado à mão) produziriam
 * strings diferentes e um falso positivo de "adulterado".
 */
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
 * Recalcula o resultado da tentativa a partir da própria configuração e
 * compara com o que está gravado. `runToEnd` é determinístico (seed, sem
 * `Math.random`/`Date.now`): duas execuções da mesma configuração produzem o
 * mesmo estado final até o último bit. Uma única checagem — recomputar e
 * comparar — cobre todas as relações internas que um payload adulterado à mão
 * poderia quebrar: chegada compatível com a posição, status compatível com o
 * resultado, dispersão compatível com as posições ao longo da execução,
 * métricas compatíveis com o estado final. Não é necessário (nem seria mais
 * confiável) reescrever essas regras uma a uma aqui — o motor já é a fonte
 * única de verdade para elas.
 */
function attemptCoherenceIssues(attempt: z.infer<typeof AttemptResultSchema>): string[] {
  if (attempt.finalState.status === 'running') {
    return [`Tentativa "${attempt.id}": estado final marcado como em andamento — uma tentativa registrada precisa ter terminado.`];
  }

  if (attempt.outcome !== attempt.finalState.status) {
    return [
      `Tentativa "${attempt.id}": o desfecho (${attempt.outcome}) não bate com o status do estado final (${attempt.finalState.status}).`,
    ];
  }

  let recomputedState;
  try {
    recomputedState = runToEnd(attempt.config);
  } catch (error) {
    return [
      `Tentativa "${attempt.id}": não foi possível recalcular o resultado para conferência. ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }

  if (!deepEqual(recomputedState, attempt.finalState)) {
    return [
      `Tentativa "${attempt.id}": o estado final gravado não corresponde ao que o motor produz para essa ` +
        'configuração e seed — posições, chegadas ou dispersão foram alteradas depois da execução.',
    ];
  }

  // O estado final bate; as métricas são função pura dele, então também
  // precisam bater. Comparar mesmo assim, em vez de assumir, cobre o caso de
  // um payload que editou só os campos de resumo (totalTimeSec, metrics) sem
  // tocar no finalState.
  const recomputedMetrics = finalizeResult(attempt.config, recomputedState);
  const issues: string[] = [];

  if (attempt.totalTimeSec !== recomputedMetrics.totalTimeSec) {
    issues.push(`Tentativa "${attempt.id}": tempo total gravado não bate com o recalculado.`);
  }
  if (attempt.meanSpreadM !== recomputedMetrics.meanSpreadM) {
    issues.push(`Tentativa "${attempt.id}": dispersão média gravada não bate com a recalculada.`);
  }
  if (!deepEqual(attempt.metrics, recomputedMetrics)) {
    issues.push(`Tentativa "${attempt.id}": métricas gravadas não batem com as recalculadas.`);
  }

  return issues;
}

export function validateSessionPayload(raw: unknown): PayloadValidation {
  // Checagem explícita antes do Zod: um payload v1 tem forma válida para a
  // v1, mas `SessionPayloadSchema` (v2) o rejeitaria com um erro genérico de
  // "literal inválido" em vez de dizer o que realmente aconteceu. Sinalizar
  // isso primeiro, com mensagem específica, é a "mudança de formato tratada
  // explicitamente" — não uma migração automática, que este MVP não faz.
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    (raw as { schemaVersion?: unknown }).schemaVersion === PREVIOUS_SCHEMA_VERSION
  ) {
    return { ok: false, payload: null, issues: [OLD_FORMAT_ISSUE] };
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
    // Motor incompatível é a causa raiz mais provável de qualquer outra
    // inconsistência física — não vale a pena também rodar validateConfig
    // aqui, ele falharia pelo mesmo motivo em cada tentativa.
    issues.push(
      `Versão do motor incompatível: sessão salva com ${payload.engineVersion}, versão atual é ${ENGINE_VERSION}.`,
    );
    return { ok: false, payload, issues };
  }

  for (const attempt of payload.history) {
    const result = validateConfig(attempt.config);
    if (!result.valid) {
      issues.push(
        `Tentativa "${attempt.id}" inválida: ${result.issues.map((issue) => issue.message).join(' ')}`,
      );
      // Configuração fisicamente inválida: recomputar o resultado sobre ela
      // não diria nada de novo além do que já falhou aqui.
      continue;
    }

    issues.push(...attemptCoherenceIssues(attempt));
  }

  if (payload.pendingAttempt) {
    const pending = payload.pendingAttempt;
    const result = validateConfig(pending.config);
    if (!result.valid) {
      issues.push(
        `Tentativa pendente "${pending.id}" inválida: ${result.issues.map((issue) => issue.message).join(' ')}`,
      );
    } else {
      issues.push(...attemptCoherenceIssues(pending));
    }
  }

  if (
    payload.referenceAttemptId !== null &&
    !payload.history.some((attempt) => attempt.id === payload.referenceAttemptId)
  ) {
    issues.push('A referência inicial aponta para uma tentativa que não está no histórico.');
  }

  return { ok: issues.length === 0, payload, issues };
}
