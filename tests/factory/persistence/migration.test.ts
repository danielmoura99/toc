import { describe, expect, it } from 'vitest';

import { buildInterventionConfig, createProductionLineConfig, stageId } from '@/features/factory/domain/config';
import { createInitialState, runToEnd, stepTurn } from '@/features/factory/domain/engine';
import { summarize } from '@/features/factory/domain/metrics';
import { buildSessionPayload } from '@/features/factory/persistence/sessionPayload';
import { validateSessionPayload, type RunResult } from '@/features/factory/persistence/schema';
import type { ProductionLineConfig } from '@/features/factory/domain/types';

function makeRun(config: ProductionLineConfig, id: string): RunResult {
  const finalState = runToEnd(config);
  return { id, createdAt: new Date().toISOString(), config, finalState, summary: summarize(config, finalState), constraintGuess: null };
}

const NEW_CONFIG_KEYS = ['experience', 'capacityModelVersion', 'capacityProfiles', 'originalConstraintStageId', 'experimentId', 'intervention'];
const NEW_SUMMARY_KEYS = ['referenceRatePerRound', 'nominalMeanByStage', 'insufficientMaterialTurnsByStage', 'utilizationByStage'];

type Json = Record<string, unknown>;

/** Reconstrói um payload no formato v1 (antes da evolução), a partir de um legado v2. */
function toV1(payload: Json): Json {
  const clone = structuredClone(payload) as Json;
  const stripConfig = (config: Json) => {
    NEW_CONFIG_KEYS.forEach((key) => delete config[key]);
    config.engineVersion = '1.0.0';
  };
  const stripState = (state: Json) => (state.events as Json[]).forEach((event) => delete event.availableCapacity);
  const stripRun = (run: Json) => {
    stripConfig(run.config as Json);
    stripState(run.finalState as Json);
    NEW_SUMMARY_KEYS.forEach((key) => delete (run.summary as Json)[key]);
    delete run.constraintGuess;
  };
  clone.schemaVersion = 1;
  clone.engineVersion = '1.0.0';
  stripConfig((clone.preparation as Json).config as Json);
  (clone.history as Json[]).forEach(stripRun);
  if (clone.activeRun) {
    stripConfig((clone.activeRun as Json).config as Json);
    stripState((clone.activeRun as Json).state as Json);
  }
  return clone;
}

function legacyV1Payload(): Json {
  const draft = createProductionLineConfig({ seed: 'legacy-draft' });
  const run = makeRun(createProductionLineConfig({ seed: 'legacy-run' }), 'legacy-1');
  const activeConfig = createProductionLineConfig({ seed: 'legacy-active', stageCount: 4 });
  let state = createInitialState(activeConfig);
  for (let i = 0; i < 6; i += 1) state = stepTurn(activeConfig, state);
  const v2 = buildSessionPayload(draft, 20, [run], null, { config: activeConfig, state });
  return toV1(v2 as unknown as Json);
}

describe('migração v1 → v2 (§9)', () => {
  it('sessão v1 é migrada para "Dependência e variabilidade", com capacidade igual ao dado', () => {
    const result = validateSessionPayload(legacyV1Payload());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);

    const run = result.payload!.history[0];
    expect(run.config.experience).toBe('dependency-variability');
    expect(run.config.capacityProfiles.every((p) => p.baseBonus === 0 && p.upgrade === 0)).toBe(true);
    expect(run.config.intervention).toBeNull();
    expect(run.finalState.events.every((e) => e.availableCapacity === e.die)).toBe(true);
    expect(run.constraintGuess).toBeNull();
    expect(result.payload!.activeRun!.state.events).toHaveLength(6);
  });

  it('partidas antigas mantêm exatamente os mesmos eventos e resultados (regressão §11.1)', () => {
    const v1 = legacyV1Payload();
    const oldRun = (v1.history as Json[])[0];
    const migrated = validateSessionPayload(v1).payload!.history[0];

    const oldEvents = (oldRun.finalState as Json).events as Json[];
    expect(migrated.finalState.events.map((e) => ({ ...e, availableCapacity: undefined }))).toEqual(
      oldEvents.map((e) => ({ ...e, availableCapacity: undefined })),
    );
    expect(migrated.summary.delivered).toBe((oldRun.summary as Json).delivered);
    expect(migrated.summary.inventoryRemaining).toBe((oldRun.summary as Json).inventoryRemaining);
    expect(migrated.summary.referenceAccumulated).toBe((oldRun.summary as Json).referenceAccumulated);
  });

  it('métrica adulterada num arquivo v1 continua sendo detectada, não corrigida em silêncio', () => {
    const v1 = legacyV1Payload();
    ((v1.history as Json[])[0].summary as Json).delivered = 999;
    const result = validateSessionPayload(v1);
    expect(result.ok).toBe(false);
  });

  it('evento adulterado num arquivo v1 é rejeitado pelo replay', () => {
    const v1 = legacyV1Payload();
    const events = ((v1.history as Json[])[0].finalState as Json).events as Json[];
    events[0].transferred = 6;
    events[0].die = 6;
    expect(validateSessionPayload(v1).ok).toBe(false);
  });
});

describe('persistência da nova experiência (§11.9)', () => {
  const base = createProductionLineConfig({ experience: 'constraint-flow', seed: 'persist-cf' });

  it('base, tentativa e hipótese do grupo sobrevivem ao roundtrip JSON', () => {
    const baseRun = { ...makeRun(base, 'base-1'), constraintGuess: { stageId: stageId(2), justification: 'menor média', answeredAt: new Date().toISOString() } };
    const attempt = makeRun(buildInterventionConfig(base, 'base-1', stageId(2), 2, 'mais entrega'), 'attempt-1');
    const payload = buildSessionPayload(base, null, [baseRun, attempt], null, null);

    const result = validateSessionPayload(JSON.parse(JSON.stringify(payload)));
    expect(result.issues).toEqual([]);
    const [restoredBase, restoredAttempt] = result.payload!.history;
    expect(restoredBase.constraintGuess?.stageId).toBe(stageId(2));
    expect(restoredAttempt.config.intervention).toEqual({ baselineRunId: 'base-1', targetStageId: stageId(2), addedCapacity: 2, prediction: 'mais entrega' });
    expect(restoredAttempt.config.capacityProfiles.map((p) => p.upgrade)).toEqual([0, 0, 2, 0, 0]);
  });

  it('a tentativa continua válida e reproduzível mesmo sem a base no histórico', () => {
    const attempt = makeRun(buildInterventionConfig(base, 'deleted-base', stageId(0), 1, ''), 'attempt-orphan');
    const result = validateSessionPayload(buildSessionPayload(base, null, [attempt], null, null));
    expect(result.ok).toBe(true);
  });

  it('perfil adulterado (bônus extra escondido) é rejeitado na importação', () => {
    const run = makeRun(base, 'base-2');
    const tampered = structuredClone(run);
    tampered.config.capacityProfiles[2].baseBonus = 2;
    const result = validateSessionPayload(buildSessionPayload(base, null, [tampered], null, null));
    expect(result.ok).toBe(false);
  });

  it('capacidade disponível gravada diferente da recalculada é rejeitada', () => {
    const run = makeRun(base, 'base-3');
    const tampered = structuredClone(run);
    tampered.finalState.events[0].availableCapacity += 1;
    expect(validateSessionPayload(buildSessionPayload(base, null, [tampered], null, null)).ok).toBe(false);
  });
});
