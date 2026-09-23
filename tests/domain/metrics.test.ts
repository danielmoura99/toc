import { describe, expect, it } from 'vitest';
import { compareAttempts, finalizeResult, meanSpreadM } from '@/features/trail/domain/metrics';
import { createAttemptConfig, itemsOwnedBy, transferItems } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { SCENARIO_A, SCENARIO_B } from '@/features/trail/scenarios';
import type { AttemptConfig, AttemptResult } from '@/features/trail/domain/types';

function makeResult(config: AttemptConfig, id: string): AttemptResult {
  const finalState = runToEnd(config);
  const metrics = finalizeResult(config, finalState);

  return {
    id,
    createdAt: '2026-09-20T12:00:00.000Z',
    config,
    outcome: metrics.outcome,
    finalState,
    totalTimeSec: metrics.totalTimeSec,
    meanSpreadM: metrics.meanSpreadM,
    metrics,
  };
}

describe('finalizeResult', () => {
  const config = createAttemptConfig(SCENARIO_A);
  const state = runToEnd(config);
  const metrics = finalizeResult(config, state);

  it('registra o tempo do último a chegar', () => {
    const arrivals = Object.values(metrics.arrivalByCharacter).map((value) => value!);
    expect(metrics.outcome).toBe('completed');
    expect(metrics.totalTimeSec).toBe(Math.max(...arrivals));
  });

  it('AC09 — o tempo total não é a chegada do primeiro', () => {
    const arrivals = Object.values(metrics.arrivalByCharacter).map((value) => value!);
    const primeiro = Math.min(...arrivals);
    expect(metrics.totalTimeSec).toBeGreaterThan(primeiro);
  });

  it('progresso coletivo é 100% quando todos chegam', () => {
    expect(metrics.collectiveProgressPct).toBeCloseTo(100, 9);
  });

  it('reporta dispersão máxima e média positivas', () => {
    expect(metrics.maxSpreadM).toBeGreaterThan(0);
    expect(metrics.meanSpreadM).toBeGreaterThan(0);
    expect(metrics.meanSpreadM).toBeLessThanOrEqual(metrics.maxSpreadM);
  });

  it('a média da dispersão é a soma dividida pelos ticks', () => {
    expect(meanSpreadM(state)).toBeCloseTo(state.sumSpreadM / state.ticksExecuted, 12);
  });

  it('reporta a carga de cada personagem', () => {
    expect(metrics.loadKgByCharacter.p5).toBe(18);
    expect(Object.values(metrics.loadKgByCharacter).reduce((sum, value) => sum + value, 0)).toBe(48);
  });

  it('separa tempo limitado de tempo parado', () => {
    for (const characterId of config.order) {
      expect(metrics.stoppedByQueueTimeByCharacter[characterId]).toBeLessThanOrEqual(
        metrics.limitedTimeByCharacter[characterId],
      );
    }
  });

  it('quem está na frente nunca é limitado pela fila (R04)', () => {
    expect(metrics.limitedTimeByCharacter[config.order[0]]).toBe(0);
  });

  it('exige uma execução encerrada', () => {
    const running = { ...state, status: 'running' as const };
    expect(() => finalizeResult(config, running)).toThrow(/encerrada/);
  });

  it('AC09 — em timeout não inventa tempo de conclusão', () => {
    const shortScenario = structuredClone(SCENARIO_A);
    shortScenario.timeLimitSec = 600; // curto demais para 3.000 m
    const shortConfig = createAttemptConfig(shortScenario);
    const shortState = runToEnd(shortConfig);
    const shortMetrics = finalizeResult(shortConfig, shortState);

    expect(shortMetrics.outcome).toBe('timed_out');
    expect(shortMetrics.totalTimeSec).toBeNull();
    expect(shortMetrics.collectiveProgressPct).toBeGreaterThan(0);
    expect(shortMetrics.collectiveProgressPct).toBeLessThan(100);
  });
});

describe('compareAttempts — comparabilidade', () => {
  it('duas tentativas do mesmo cenário e seed são comparáveis', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const current = makeResult(
      createAttemptConfig(SCENARIO_A, { order: ['p5', 'p1', 'p2', 'p3', 'p4', 'p6'] }),
      'a2',
    );

    const comparison = compareAttempts(reference, current);
    expect(comparison.comparable).toBe(true);
    expect(comparison.issues).toEqual([]);
    expect(comparison.improvementPct).not.toBeNull();
  });

  it('AC11 — cenários diferentes não recebem percentual de melhoria', () => {
    const a = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const b = makeResult(createAttemptConfig(SCENARIO_B), 'b1');

    const comparison = compareAttempts(a, b);
    expect(comparison.comparable).toBe(false);
    expect(comparison.issues).toContain('scenario');
    expect(comparison.improvementPct).toBeNull();
    expect(comparison.totalTimeDeltaSec).toBeNull();
  });

  it('AC11 — seeds diferentes não recebem percentual de melhoria', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const current = makeResult(createAttemptConfig(SCENARIO_A, { seed: 'outra-seed' }), 'a2');

    const comparison = compareAttempts(reference, current);
    expect(comparison.comparable).toBe(false);
    expect(comparison.issues).toContain('seed');
    expect(comparison.improvementPct).toBeNull();
  });

  it('elenco alterado quebra a comparabilidade', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const tweaked = createAttemptConfig(SCENARIO_A);
    tweaked.scenario.characters[0].baseSpeedKmh = 9;
    const current = makeResult(tweaked, 'a2');

    expect(compareAttempts(reference, current).issues).toContain('cast');
  });

  it('modos de variabilidade diferentes quebram a comparabilidade (§4.3 da evolução pedagógica)', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A, { variabilityMode: 'standard' }), 'a1');
    const current = makeResult(createAttemptConfig(SCENARIO_A, { variabilityMode: 'disabled' }), 'a2');

    const comparison = compareAttempts(reference, current);
    expect(comparison.comparable).toBe(false);
    expect(comparison.issues).toContain('variability_mode');
    expect(comparison.improvementPct).toBeNull();
  });

  it('modos de fadiga diferentes quebram a comparabilidade (§7.3 da evolução pedagógica)', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A, { fatigueMode: 'disabled' }), 'a1');
    const current = makeResult(createAttemptConfig(SCENARIO_A, { fatigueMode: 'enabled' }), 'a2');

    const comparison = compareAttempts(reference, current);
    expect(comparison.comparable).toBe(false);
    expect(comparison.issues).toContain('fatigue_mode');
    expect(comparison.improvementPct).toBeNull();
  });

  it('mesma fadiga ativa dos dois lados é comparável (redistribuir com fadiga é permitido, §7.3)', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A, { fatigueMode: 'enabled' }), 'a1');
    const current = makeResult(
      createAttemptConfig(SCENARIO_A, { fatigueMode: 'enabled', order: ['p5', 'p1', 'p2', 'p3', 'p4', 'p6'] }),
      'a2',
    );

    const comparison = compareAttempts(reference, current);
    expect(comparison.comparable).toBe(true);
    expect(comparison.issues).not.toContain('fatigue_mode');
  });

  it('timeout não produz percentual de melhoria', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const timedOutScenario = structuredClone(SCENARIO_A);
    timedOutScenario.timeLimitSec = 600;
    const current = makeResult(createAttemptConfig(timedOutScenario), 'a2');

    const comparison = compareAttempts(reference, current);
    expect(current.totalTimeSec).toBeNull();
    expect(comparison.improvementPct).toBeNull();
  });
});

describe('compareAttempts — diferenças declaradas', () => {
  it('declara mudança de ordem', () => {
    const reference = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const current = makeResult(
      createAttemptConfig(SCENARIO_A, { order: ['p5', 'p1', 'p2', 'p3', 'p4', 'p6'] }),
      'a2',
    );

    const { changes } = compareAttempts(reference, current);
    expect(changes.orderChanged).toBe(true);
    expect(changes.loadChanged).toBe(false);
    expect(changes.currentOrder[0]).toBe('p5');
  });

  it('declara mudança de carga, com delta por personagem', () => {
    const referenceConfig = createAttemptConfig(SCENARIO_A);
    const moved = itemsOwnedBy(referenceConfig, 'p5').slice(0, 6);
    const currentConfig = transferItems(referenceConfig, moved, 'p3');

    const comparison = compareAttempts(
      makeResult(referenceConfig, 'a1'),
      makeResult(currentConfig, 'a2'),
    );

    expect(comparison.changes.loadChanged).toBe(true);
    expect(comparison.changes.orderChanged).toBe(false);
    expect(comparison.changes.loadDeltaKgByCharacter.p5).toBe(-6);
    expect(comparison.changes.loadDeltaKgByCharacter.p3).toBe(6);
    // Redistribuição conserva o total: a soma dos deltas é zero.
    expect(
      Object.values(comparison.changes.loadDeltaKgByCharacter).reduce((sum, value) => sum + value, 0),
    ).toBe(0);
  });

  it('percentual positivo significa redução de tempo', () => {
    const referenceConfig = createAttemptConfig(SCENARIO_A);
    // Aliviar a restrição deve reduzir o tempo do grupo.
    const moved = itemsOwnedBy(referenceConfig, 'p5').slice(0, 9);
    const currentConfig = transferItems(referenceConfig, moved, 'p3');

    const reference = makeResult(referenceConfig, 'a1');
    const current = makeResult(currentConfig, 'a2');
    const comparison = compareAttempts(reference, current);

    expect(current.totalTimeSec!).toBeLessThan(reference.totalTimeSec!);
    expect(comparison.improvementPct!).toBeGreaterThan(0);
    expect(comparison.totalTimeDeltaSec!).toBeLessThan(0);

    // Confere a fórmula do guia.
    const esperado =
      ((reference.totalTimeSec! - current.totalTimeSec!) / reference.totalTimeSec!) * 100;
    expect(comparison.improvementPct!).toBeCloseTo(esperado, 9);
  });

  it('comparar a tentativa consigo mesma não indica ganho', () => {
    const result = makeResult(createAttemptConfig(SCENARIO_A), 'a1');
    const comparison = compareAttempts(result, result);

    expect(comparison.improvementPct).toBeCloseTo(0, 12);
    expect(comparison.totalTimeDeltaSec).toBe(0);
    expect(comparison.changes.orderChanged).toBe(false);
    expect(comparison.changes.loadChanged).toBe(false);
  });
});
