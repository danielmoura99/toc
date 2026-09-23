import { describe, expect, it } from 'vitest';

import { gapTrend, observedState, SPREAD_TREND_EPSILON_M } from '@/features/trail/domain/observation';
import type { CharacterState } from '@/features/trail/domain/types';

function walker(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'x',
    positionM: 10,
    availableSpeedMps: 1,
    actualSpeedMps: 1,
    arrivalTimeSec: null,
    isLimited: false,
    limitedTimeSec: 0,
    stoppedByQueueTimeSec: 0,
    equivalentLostTimeSec: 0,
    energy: 1,
    ...overrides,
  };
}

describe('gapTrend', () => {
  it('aumentando quando a distância cresce além da tolerância', () => {
    expect(gapTrend(10, 12)).toBe('increasing');
  });

  it('diminuindo quando a distância cai além da tolerância', () => {
    expect(gapTrend(10, 8)).toBe('decreasing');
  });

  it('estável dentro da tolerância, nos dois sentidos', () => {
    expect(gapTrend(10, 10 + SPREAD_TREND_EPSILON_M / 2)).toBe('stable');
    expect(gapTrend(10, 10 - SPREAD_TREND_EPSILON_M / 2)).toBe('stable');
    expect(gapTrend(10, 10)).toBe('stable');
  });

  it('exatamente na borda da tolerância ainda conta como mudança', () => {
    expect(gapTrend(10, 10 + SPREAD_TREND_EPSILON_M)).toBe('increasing');
  });
});

describe('observedState', () => {
  it('quem chegou é "arrived", mesmo se tecnicamente ainda limitado ou sem predecessor', () => {
    const arrived = walker({ arrivalTimeSec: 120, isLimited: true });
    expect(observedState(arrived, true, 'increasing')).toBe('arrived');
  });

  it('sem predecessor (vai na frente) é "no_predecessor", mesmo com tendência calculada', () => {
    expect(observedState(walker(), false, 'stable')).toBe('no_predecessor');
  });

  it('limitado pela fila tem prioridade sobre a tendência do espaço', () => {
    expect(observedState(walker({ isLimited: true }), true, 'stable')).toBe('limited');
    expect(observedState(walker({ isLimited: true }), true, 'increasing')).toBe('limited');
  });

  it('sem limitação, usa a tendência do espaço', () => {
    expect(observedState(walker({ isLimited: false }), true, 'increasing')).toBe('increasing');
    expect(observedState(walker({ isLimited: false }), true, 'decreasing')).toBe('decreasing');
    expect(observedState(walker({ isLimited: false }), true, 'stable')).toBe('stable');
  });

  it('sem tendência calculada (primeira amostra), cai em "stable" por padrão', () => {
    expect(observedState(walker({ isLimited: false }), true, null)).toBe('stable');
  });
});
