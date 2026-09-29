/**
 * Migração explícita v1 → v2 (evolução "Restrição e fluxo", §9).
 *
 * Sessões v1 não têm experiência nem perfis de capacidade: todas eram
 * "Dependência e variabilidade", com capacidade igual ao dado. A migração só
 * acrescenta esses campos com o significado que eles SEMPRE tiveram — perfis
 * zero, `availableCapacity = die` — e nunca reinterpreta partidas antigas com
 * bônus. O motor 1.1.0 com perfis zero é fisicamente idêntico ao 1.0.0; a
 * validação seguinte refaz cada partida e rejeita qualquer divergência.
 *
 * As métricas antigas são conferidas campo a campo contra o recálculo antes
 * de serem substituídas pelas novas: uma métrica adulterada no arquivo v1
 * continua sendo detectada, em vez de ser "corrigida" silenciosamente.
 */

import { baseProfiles } from '../domain/capacity';
import { runToEnd } from '../domain/engine';
import { summarize } from '../domain/metrics';
import type { ProductionLineConfig, StageDefinition } from '../domain/types';
import { CAPACITY_MODEL_VERSION, ENGINE_VERSION } from '../domain/types';

type Json = Record<string, unknown>;

const LEGACY_ENGINE_VERSION = '1.0.0';

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Todo campo presente em `old` existe em `fresh` com o mesmo valor (campos novos em `fresh` são ignorados). */
function subsetEqual(old: unknown, fresh: unknown): boolean {
  if (Array.isArray(old)) {
    return Array.isArray(fresh) && old.length === fresh.length && old.every((value, index) => subsetEqual(value, fresh[index]));
  }
  if (isObject(old)) {
    return isObject(fresh) && Object.keys(old).every((key) => subsetEqual(old[key], fresh[key]));
  }
  return old === fresh;
}

function migrateConfig(config: unknown): unknown {
  if (!isObject(config) || !Array.isArray(config.stages)) return config;
  return {
    ...config,
    engineVersion: config.engineVersion === LEGACY_ENGINE_VERSION ? ENGINE_VERSION : config.engineVersion,
    experience: 'dependency-variability',
    capacityModelVersion: CAPACITY_MODEL_VERSION,
    capacityProfiles: baseProfiles('dependency-variability', config.stages as StageDefinition[]),
    originalConstraintStageId: null,
    experimentId: null,
    intervention: null,
  };
}

function migrateState(state: unknown): unknown {
  if (!isObject(state) || !Array.isArray(state.events)) return state;
  return {
    ...state,
    events: state.events.map((event) => (isObject(event) ? { ...event, availableCapacity: event.die } : event)),
  };
}

function migrateRun(run: unknown): unknown {
  if (!isObject(run)) return run;
  const config = migrateConfig(run.config);
  const finalState = migrateState(run.finalState);
  const migrated: Json = { ...run, config, finalState, constraintGuess: null };

  try {
    const fresh = summarize(config as ProductionLineConfig, runToEnd(config as ProductionLineConfig));
    if (subsetEqual(run.summary, fresh)) migrated.summary = fresh;
  } catch {
    // Configuração inválida: deixa o resumo como está; a validação seguinte reporta o motivo.
  }
  return migrated;
}

export function migrateV1ToV2(raw: Json): Json {
  const preparation = isObject(raw.preparation)
    ? { ...raw.preparation, config: migrateConfig(raw.preparation.config) }
    : raw.preparation;
  const activeRun = isObject(raw.activeRun)
    ? { config: migrateConfig(raw.activeRun.config), state: migrateState(raw.activeRun.state) }
    : raw.activeRun;

  return {
    ...raw,
    schemaVersion: 2,
    engineVersion: raw.engineVersion === LEGACY_ENGINE_VERSION ? ENGINE_VERSION : raw.engineVersion,
    preparation,
    history: Array.isArray(raw.history) ? raw.history.map(migrateRun) : raw.history,
    pendingRun: raw.pendingRun === null ? null : migrateRun(raw.pendingRun),
    activeRun: activeRun ?? null,
  };
}
