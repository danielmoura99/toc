import { describe, expect, it } from 'vitest';

import {
  buildWithoutVariabilityConfig,
  canStartVariabilityExperiment,
  hasVariabilityToObserve,
  isSmallTimeDifference,
  signedDifference,
  validateVariabilityPair,
} from '@/features/trail/application/variabilityExperiment';
import { createAttemptConfig, transferItems } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { finalizeResult } from '@/features/trail/domain/metrics';
import type { AttemptResult } from '@/features/trail/domain/types';
import { SCENARIO_A } from '@/features/trail/scenarios';
import { buildScenario } from '@/features/trail/scenarios/builder';

function recordFromConfig(config: ReturnType<typeof createAttemptConfig>, id: string): AttemptResult {
  const finalState = runToEnd(config);
  const metrics = finalizeResult(config, finalState);
  return {
    id,
    createdAt: new Date().toISOString(),
    config,
    outcome: metrics.outcome,
    finalState,
    totalTimeSec: metrics.totalTimeSec,
    meanSpreadM: metrics.meanSpreadM,
    metrics,
  };
}

function originAttempt(seed = 'seed-origem', id = 'origem'): AttemptResult {
  return recordFromConfig(createAttemptConfig(SCENARIO_A, { seed }), id);
}

describe('hasVariabilityToObserve', () => {
  it('verdadeiro quando algum personagem tem variabilidade > 0 (cenário A tem)', () => {
    expect(hasVariabilityToObserve(SCENARIO_A)).toBe(true);
  });

  it('falso quando todos têm variabilidade zero', () => {
    const scenario = buildScenario({
      id: 'lab-sem-variacao',
      revision: 1,
      distanceM: 1000,
      timeLimitSec: 3600,
      defaultSeed: 'lab',
      characters: [{ id: 'a', displayName: 'A', baseSpeedKmh: 5, referenceLoadKg: 10, variability: 0 }],
      initialOrder: ['a'],
      initialLoadKgByCharacter: { a: 0 },
    });
    expect(hasVariabilityToObserve(scenario)).toBe(false);
  });
});

describe('canStartVariabilityExperiment', () => {
  it('elegível: tentativa normal, modo padrão, com variabilidade a observar', () => {
    expect(canStartVariabilityExperiment(originAttempt()).ok).toBe(true);
  });

  it('inelegível: já é uma tentativa experimental (modo desligado)', () => {
    const origin = originAttempt();
    const experimental = recordFromConfig(buildWithoutVariabilityConfig(origin), 'exp');
    expect(canStartVariabilityExperiment(experimental).ok).toBe(false);
  });

  it('inelegível: já é derivada de outro experimento', () => {
    const origin = originAttempt();
    const withLink = { ...origin, config: { ...origin.config, experimentOf: { originAttemptId: 'outro', kind: 'variability' as const } } };
    expect(canStartVariabilityExperiment(withLink).ok).toBe(false);
  });
});

describe('buildWithoutVariabilityConfig', () => {
  it('preserva seed, ordem, cargas e cenário; só muda o modo e o vínculo', () => {
    const origin = originAttempt();
    const built = buildWithoutVariabilityConfig(origin);

    expect(built.variabilityMode).toBe('disabled');
    expect(built.experimentOf).toEqual({ originAttemptId: origin.id, kind: 'variability' });
    expect(built.seed).toBe(origin.config.seed);
    expect(built.order).toEqual(origin.config.order);
    expect(built.ownerByItem).toEqual(origin.config.ownerByItem);
    expect(built.scenario.id).toBe(origin.config.scenario.id);
  });
});

describe('validateVariabilityPair', () => {
  it('aceita um par válido de verdade (construído por buildWithoutVariabilityConfig)', () => {
    const origin = originAttempt();
    const without = recordFromConfig(buildWithoutVariabilityConfig(origin), 'sem-var');

    const validation = validateVariabilityPair(origin, without);
    expect(validation.ok, validation.issues.join(' | ')).toBe(true);
  });

  it('rejeita quando a ordem difere entre as condições', () => {
    const origin = originAttempt();
    const withoutConfig = { ...buildWithoutVariabilityConfig(origin), order: [...origin.config.order].reverse() };
    const without = recordFromConfig(withoutConfig, 'sem-var');

    expect(validateVariabilityPair(origin, without).ok).toBe(false);
  });

  it('rejeita quando a carga difere entre as condições', () => {
    const origin = originAttempt();
    const withoutBase = buildWithoutVariabilityConfig(origin);
    const moved = withoutBase.scenario.items
      .filter((item) => withoutBase.ownerByItem[item.id] === 'p5')
      .slice(0, 3)
      .map((item) => item.id);
    const withoutConfig = transferItems(withoutBase, moved, 'p1');
    const without = recordFromConfig(withoutConfig, 'sem-var');

    expect(validateVariabilityPair(origin, without).ok).toBe(false);
  });

  it('rejeita quando a seed difere entre as condições', () => {
    const origin = originAttempt();
    const withoutConfig = { ...buildWithoutVariabilityConfig(origin), seed: 'outra-seed' };
    const without = recordFromConfig(withoutConfig, 'sem-var');

    expect(validateVariabilityPair(origin, without).ok).toBe(false);
  });

  it('rejeita quando o vínculo experimental não aponta para a origem certa', () => {
    const origin = originAttempt();
    const other = originAttempt('seed-outra-origem', 'outra-origem');
    const withoutConfig = { ...buildWithoutVariabilityConfig(origin), experimentOf: { originAttemptId: other.id, kind: 'variability' as const } };
    const without = recordFromConfig(withoutConfig, 'sem-var');

    expect(validateVariabilityPair(origin, without).ok).toBe(false);
  });

  it('rejeita quando a condição "com" não está no modo padrão', () => {
    const origin = recordFromConfig(createAttemptConfig(SCENARIO_A, { variabilityMode: 'disabled' }), 'origem-errada');
    const without = recordFromConfig(buildWithoutVariabilityConfig(origin), 'sem-var');

    expect(validateVariabilityPair(origin, without).ok).toBe(false);
  });
});

describe('signedDifference / isSmallTimeDifference', () => {
  it('diferença assinada com − sem', () => {
    expect(signedDifference(100, 80)).toBe(20);
    expect(signedDifference(80, 100)).toBe(-20);
  });

  it('nulo quando um dos lados não tem tempo (timeout)', () => {
    expect(signedDifference(null, 80)).toBeNull();
    expect(signedDifference(100, null)).toBeNull();
  });

  it('marca como pequena uma diferença abaixo de 2% do tempo "com variabilidade"', () => {
    expect(isSmallTimeDifference(10, 1000)).toBe(true); // 1%
    expect(isSmallTimeDifference(50, 1000)).toBe(false); // 5%
  });
});
