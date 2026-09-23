import { describe, expect, it } from 'vitest';

import {
  buildWithFatigueConfig,
  canStartFatigueExperiment,
  validateFatiguePair,
} from '@/features/trail/application/fatigueExperiment';
import { canStartVariabilityExperiment } from '@/features/trail/application/variabilityExperiment';
import { createAttemptConfig, transferItems } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { DEFAULT_FATIGUE_PARAMS } from '@/features/trail/domain/fatigue';
import { finalizeResult } from '@/features/trail/domain/metrics';
import type { AttemptResult } from '@/features/trail/domain/types';
import { SCENARIO_A } from '@/features/trail/scenarios';

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

function originAttempt(id = 'origem'): AttemptResult {
  return recordFromConfig(createAttemptConfig(SCENARIO_A), id);
}

describe('canStartFatigueExperiment', () => {
  it('elegível: tentativa normal, sem fadiga, versão do motor atual', () => {
    expect(canStartFatigueExperiment(originAttempt()).ok).toBe(true);
  });

  it('inelegível: já está numa condição experimental de fadiga', () => {
    const origin = originAttempt();
    const withFatigue = recordFromConfig(buildWithFatigueConfig(origin), 'com-fadiga');
    expect(canStartFatigueExperiment(withFatigue).ok).toBe(false);
  });

  it('inelegível: já é derivada de outro experimento', () => {
    const origin = originAttempt();
    const withLink = {
      ...origin,
      config: { ...origin.config, experimentOf: { originAttemptId: 'outro', kind: 'variability' as const } },
    };
    expect(canStartFatigueExperiment(withLink).ok).toBe(false);
  });

  it('inelegível: versão do motor diferente da atual', () => {
    const origin = originAttempt();
    const older = { ...origin, config: { ...origin.config, engineVersion: '0.0.1' } };
    expect(canStartFatigueExperiment(older).ok).toBe(false);
  });
});

describe('buildWithFatigueConfig', () => {
  it('preserva seed, ordem, cargas, variabilidade e cenário; só ativa a fadiga', () => {
    const origin = originAttempt();
    const built = buildWithFatigueConfig(origin);

    expect(built.fatigueMode).toBe('enabled');
    expect(built.fatigueParams).toEqual(DEFAULT_FATIGUE_PARAMS);
    expect(built.experimentOf).toEqual({ originAttemptId: origin.id, kind: 'fatigue' });
    expect(built.seed).toBe(origin.config.seed);
    expect(built.order).toEqual(origin.config.order);
    expect(built.ownerByItem).toEqual(origin.config.ownerByItem);
    expect(built.variabilityMode).toBe(origin.config.variabilityMode);
  });
});

describe('validateFatiguePair', () => {
  it('aceita um par válido de verdade (construído por buildWithFatigueConfig)', () => {
    const origin = originAttempt();
    const withFatigue = recordFromConfig(buildWithFatigueConfig(origin), 'com-fadiga');

    const validation = validateFatiguePair(origin, withFatigue);
    expect(validation.ok, validation.issues.join(' | ')).toBe(true);
  });

  it('rejeita quando a ordem difere entre as condições', () => {
    const origin = originAttempt();
    const withFatigueConfig = { ...buildWithFatigueConfig(origin), order: [...origin.config.order].reverse() };
    const withFatigue = recordFromConfig(withFatigueConfig, 'com-fadiga');

    expect(validateFatiguePair(origin, withFatigue).ok).toBe(false);
  });

  it('rejeita quando a carga difere entre as condições', () => {
    const origin = originAttempt();
    const base = buildWithFatigueConfig(origin);
    const moved = base.scenario.items
      .filter((item) => base.ownerByItem[item.id] === 'p5')
      .slice(0, 3)
      .map((item) => item.id);
    const withFatigueConfig = transferItems(base, moved, 'p1');
    const withFatigue = recordFromConfig(withFatigueConfig, 'com-fadiga');

    expect(validateFatiguePair(origin, withFatigue).ok).toBe(false);
  });

  it('rejeita quando a condição de variabilidade difere entre as condições', () => {
    const origin = originAttempt();
    const withFatigueConfig = { ...buildWithFatigueConfig(origin), variabilityMode: 'disabled' as const };
    const withFatigue = recordFromConfig(withFatigueConfig, 'com-fadiga');

    expect(validateFatiguePair(origin, withFatigue).ok).toBe(false);
  });

  it('rejeita quando o vínculo experimental não aponta para a origem certa', () => {
    const origin = originAttempt();
    const other = originAttempt('outra-origem');
    const withFatigueConfig = {
      ...buildWithFatigueConfig(origin),
      experimentOf: { originAttemptId: other.id, kind: 'fatigue' as const },
    };
    const withFatigue = recordFromConfig(withFatigueConfig, 'com-fadiga');

    expect(validateFatiguePair(origin, withFatigue).ok).toBe(false);
  });

  it('rejeita quando a condição "sem fadiga" não está realmente sem fadiga', () => {
    const wrongOrigin = recordFromConfig(
      createAttemptConfig(SCENARIO_A, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS }),
      'origem-errada',
    );
    const withFatigue = recordFromConfig(buildWithFatigueConfig(wrongOrigin), 'com-fadiga');

    expect(validateFatiguePair(wrongOrigin, withFatigue).ok).toBe(false);
  });
});

describe('experimento de variabilidade exige fadiga desligada dos dois lados (§7.3)', () => {
  it('uma tentativa com fadiga ativa não pode iniciar um experimento de variabilidade', () => {
    const origin = originAttempt();
    const withFatigue = recordFromConfig(buildWithFatigueConfig(origin), 'com-fadiga');

    const validation = canStartVariabilityExperiment(withFatigue);
    expect(validation.ok).toBe(false);
  });
});
