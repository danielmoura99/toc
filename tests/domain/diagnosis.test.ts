import { describe, expect, it } from 'vitest';

import {
  CAPACITY_CANDIDATE_TOLERANCE,
  currentCapacityKmh,
  diagnoseCapacity,
  diagnoseCurrentCapacity,
  referenceSpeedWithLoadKmh,
  sameCandidateSet,
} from '@/features/trail/domain/diagnosis';
import { createAttemptConfig, transferItems } from '@/features/trail/domain/attempt';
import { createInitialState, step } from '@/features/trail/domain/engine';
import { DEFAULT_FATIGUE_PARAMS } from '@/features/trail/domain/fatigue';
import { SCENARIO_A } from '@/features/trail/scenarios';
import { buildScenario } from '@/features/trail/scenarios/builder';

describe('referenceSpeedWithLoadKmh', () => {
  it('reproduz a fórmula do motor à mão: base × 1/(1 + 0,2 × carga/referência)', () => {
    // 4,5 km/h, 18 kg carregados sobre 6 kg de referência (o exemplo do próprio documento: ~2,8 km/h).
    expect(referenceSpeedWithLoadKmh(4.5, 18, 6)).toBeCloseTo(2.8125, 4);
  });

  it('carga zero não penaliza: ritmo de referência igual ao ritmo base', () => {
    expect(referenceSpeedWithLoadKmh(5, 0, 10)).toBeCloseTo(5, 6);
  });
});

describe('diagnoseCapacity', () => {
  it('identifica uma única candidata clara no cenário A — a mesma que a calibração já conhece', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const diagnosis = diagnoseCapacity(config);

    expect(diagnosis.candidateIds).toEqual(['p5']);
    expect(diagnosis.minReferenceSpeedKmh).toBeCloseTo(2.8125, 4);
  });

  it('reordenar sem redistribuir não muda o diagnóstico (depende só da carga)', () => {
    const original = diagnoseCapacity(createAttemptConfig(SCENARIO_A));
    const reordered = diagnoseCapacity(
      createAttemptConfig(SCENARIO_A, { order: [...SCENARIO_A.initialOrder].reverse() }),
    );

    expect(reordered).toEqual(original);
  });

  it('redistribuir a carga recalcula o diagnóstico', () => {
    const before = createAttemptConfig(SCENARIO_A);
    // Move toda a carga de p5 (a candidata original) para p3 — o suficiente
    // para trocar quem tem o menor ritmo de referência, não só reduzir a folga.
    const moved = before.scenario.items
      .filter((item) => before.ownerByItem[item.id] === 'p5')
      .map((item) => item.id);
    const after = transferItems(before, moved, 'p3');

    const beforeDiagnosis = diagnoseCapacity(before);
    const afterDiagnosis = diagnoseCapacity(after);

    expect(beforeDiagnosis.candidateIds).toEqual(['p5']);
    expect(afterDiagnosis.candidateIds).toEqual(['p3']);
  });

  it('capacidades dentro da tolerância de 1% aparecem juntas, sem uma candidata única', () => {
    const scenario = buildScenario({
      id: 'lab-empate',
      revision: 1,
      distanceM: 1000,
      timeLimitSec: 3600,
      defaultSeed: 'lab-empate',
      characters: [
        { id: 'a', displayName: 'A', baseSpeedKmh: 5, referenceLoadKg: 10, variability: 0 },
        // 0,5% mais lento que "a" — dentro da tolerância de 1%.
        { id: 'b', displayName: 'B', baseSpeedKmh: 4.975, referenceLoadKg: 10, variability: 0 },
        // Claramente mais rápido — fora da tolerância.
        { id: 'c', displayName: 'C', baseSpeedKmh: 8, referenceLoadKg: 10, variability: 0 },
      ],
      initialOrder: ['a', 'b', 'c'],
      initialLoadKgByCharacter: { a: 0, b: 0, c: 0 },
    });

    const diagnosis = diagnoseCapacity(createAttemptConfig(scenario));
    expect(new Set(diagnosis.candidateIds)).toEqual(new Set(['a', 'b']));
  });

  it('a tolerância de candidatas é 1%', () => {
    expect(CAPACITY_CANDIDATE_TOLERANCE).toBe(0.01);
  });
});

describe('sameCandidateSet', () => {
  it('verdadeiro para os mesmos ids, em qualquer ordem', () => {
    expect(sameCandidateSet(['p1', 'p5'], ['p5', 'p1'])).toBe(true);
  });

  it('falso quando o conjunto muda', () => {
    expect(sameCandidateSet(['p5'], ['p3'])).toBe(false);
    expect(sameCandidateSet(['p5'], ['p5', 'p3'])).toBe(false);
  });
});

describe('currentCapacityKmh — evolução pedagógica, frente 5', () => {
  it('com energia 1, é igual ao ritmo de referência (sem efeito de fadiga)', () => {
    expect(currentCapacityKmh(4.5, 18, 6, 1, DEFAULT_FATIGUE_PARAMS)).toBeCloseTo(
      referenceSpeedWithLoadKmh(4.5, 18, 6),
      10,
    );
  });

  it('com energia 0, cai para o piso (referência × minFatigueFactor)', () => {
    expect(currentCapacityKmh(4.5, 18, 6, 0, DEFAULT_FATIGUE_PARAMS)).toBeCloseTo(
      referenceSpeedWithLoadKmh(4.5, 18, 6) * DEFAULT_FATIGUE_PARAMS.minFatigueFactor,
      10,
    );
  });
});

describe('diagnoseCurrentCapacity — "provável restrição agora" (§7.4)', () => {
  it('sem fadiga ativa (energia sempre 1), é equivalente ao diagnóstico estático — só filtra quem já chegou', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const state = step(config, createInitialState(config));

    const live = diagnoseCurrentCapacity(config, state.characters);
    const staticDiagnosis = diagnoseCapacity(config);

    expect(live.candidateIds).toEqual(staticDiagnosis.candidateIds);
    expect(live.activeIds).toHaveLength(config.scenario.characters.length);
  });

  it('quem já chegou some do conjunto ativo e não conta como candidata', () => {
    const scenario = buildScenario({
      id: 'lab-diag-chegada',
      revision: 1,
      distanceM: 10,
      timeLimitSec: 1000,
      defaultSeed: 'lab-diag-chegada',
      characters: [
        { id: 'rapido', displayName: 'Rápido', baseSpeedKmh: 36, referenceLoadKg: 10, variability: 0 },
        { id: 'lento', displayName: 'Lento', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 },
      ],
      initialOrder: ['rapido', 'lento'],
      initialLoadKgByCharacter: { rapido: 10, lento: 10 },
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    let state = createInitialState(config);
    while (state.characters.rapido.arrivalTimeSec === null) {
      state = step(config, state);
    }

    const live = diagnoseCurrentCapacity(config, state.characters);
    expect(live.activeIds).toEqual(['lento']);
    expect(live.candidateIds).toEqual(['lento']);
  });

  it('quando todos chegaram, não há candidatas nem capacidade mínima', () => {
    const scenario = buildScenario({
      id: 'lab-diag-fim',
      revision: 1,
      distanceM: 10,
      timeLimitSec: 1000,
      defaultSeed: 'lab-diag-fim',
      characters: [{ id: 'solo', displayName: 'Solo', baseSpeedKmh: 36, referenceLoadKg: 10, variability: 0 }],
      initialOrder: ['solo'],
      initialLoadKgByCharacter: { solo: 10 },
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    let state = createInitialState(config);
    while (state.status === 'running') state = step(config, state);

    const live = diagnoseCurrentCapacity(config, state.characters);
    expect(live.activeIds).toEqual([]);
    expect(live.candidateIds).toEqual([]);
    expect(live.minCurrentCapacityKmh).toBeNull();
  });
});
