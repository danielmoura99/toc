import { describe, expect, it } from 'vitest';
import {
  availableSpeedMps,
  computeLoadByCharacter,
  createInitialState,
  kmhToMps,
  loadFactor,
  referenceSpeedMps,
  runToEnd,
  step,
} from '@/features/trail/domain/engine';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { DEFAULT_FATIGUE_PARAMS, fatigueFactor } from '@/features/trail/domain/fatigue';
import { buildScenario } from '@/features/trail/scenarios/builder';
import { SCENARIO_A } from '@/features/trail/scenarios';
import type { AttemptConfig, CharacterId, FatigueParams } from '@/features/trail/domain/types';
import { ENGINE_VERSION, TICK_SEC } from '@/features/trail/domain/types';

/**
 * Cenário de laboratório sem variabilidade: os tempos passam a ser calculáveis
 * à mão, o que dá ao motor uma referência independente dele mesmo.
 */
function labScenario(options: {
  characters: Array<{ id: string; baseSpeedKmh: number; referenceLoadKg?: number }>;
  distanceM?: number;
  loadKgByCharacter?: Record<string, number>;
  order?: string[];
}) {
  const characters = options.characters.map((character) => ({
    id: character.id,
    displayName: character.id.toUpperCase(),
    baseSpeedKmh: character.baseSpeedKmh,
    referenceLoadKg: character.referenceLoadKg ?? 10,
    variability: 0, // sem variação: resultado fechado
  }));

  const loadKgByCharacter: Record<string, number> = {};
  for (const character of characters) {
    loadKgByCharacter[character.id] = options.loadKgByCharacter?.[character.id] ?? 0;
  }

  return buildScenario({
    id: 'lab',
    revision: 1,
    distanceM: options.distanceM ?? 1000,
    timeLimitSec: 100000,
    defaultSeed: 'lab-seed',
    characters,
    initialOrder: options.order ?? characters.map((character) => character.id),
    initialLoadKgByCharacter: loadKgByCharacter,
  });
}

describe('fórmulas de velocidade', () => {
  it('converte km/h em m/s', () => {
    expect(kmhToMps(3.6)).toBeCloseTo(1, 12);
    expect(kmhToMps(4.5)).toBeCloseTo(1.25, 12);
  });

  it('reproduz o exemplo do guia: p5 com 18 kg anda a 2,8125 km/h', () => {
    // 4,5 / (1 + 0,20 × 18/6) = 4,5 / 1,6 = 2,8125
    const factor = loadFactor(18, 6);
    expect(4.5 * factor).toBeCloseTo(2.8125, 10);
  });

  it('reproduz o exemplo do guia: p5 com 6 kg anda a 3,75 km/h', () => {
    // 4,5 / (1 + 0,20 × 6/6) = 4,5 / 1,2 = 3,75
    const factor = loadFactor(6, 6);
    expect(4.5 * factor).toBeCloseTo(3.75, 10);
  });

  it('carga zero não penaliza', () => {
    expect(loadFactor(0, 12)).toBe(1);
  });

  it('a penalidade é a mesma fórmula para todos — não há exceção por personagem', () => {
    // Mesma razão carga/referência produz o mesmo fator, independentemente do ID.
    expect(loadFactor(24, 12)).toBeCloseTo(loadFactor(12, 6), 12);
    expect(loadFactor(30, 10)).toBeCloseTo(loadFactor(42, 14), 12);
  });
});

describe('variabilityMode — evolução pedagógica, frente 2', () => {
  it('"standard" (padrão) reproduz exatamente o comportamento de sempre', () => {
    const withDefault = availableSpeedMps(
      SCENARIO_A.characters[0],
      6,
      'seed-x',
      0,
      SCENARIO_A.variabilityBlockSec,
    );
    const withExplicitStandard = availableSpeedMps(
      SCENARIO_A.characters[0],
      6,
      'seed-x',
      0,
      SCENARIO_A.variabilityBlockSec,
      'standard',
    );
    expect(withExplicitStandard).toBe(withDefault);
  });

  it('"disabled" usa fator 1: resultado igual para qualquer seed', () => {
    const character = SCENARIO_A.characters.find((c) => c.id === 'p5')!; // variability > 0
    const bySeed = ['seed-a', 'seed-b', 'seed-c'].map((seed) =>
      availableSpeedMps(character, 18, seed, 90, SCENARIO_A.variabilityBlockSec, 'disabled'),
    );

    for (const value of bySeed) {
      expect(value).toBeCloseTo(bySeed[0], 12);
    }
    // Fator 1: igual à fórmula sem variação nenhuma (base × carga).
    expect(bySeed[0]).toBeCloseTo(kmhToMps(character.baseSpeedKmh) * loadFactor(18, character.referenceLoadKg), 12);
  });

  it('"disabled" não altera a fórmula de carga nem a atualização de posições — só a flutuação', () => {
    const standard = createAttemptConfig(SCENARIO_A, { variabilityMode: 'standard' });
    const disabled = createAttemptConfig(SCENARIO_A, { variabilityMode: 'disabled' });

    // Mesma ordem, mesmas cargas, mesma seed — só o modo difere.
    expect(disabled.order).toEqual(standard.order);
    expect(computeLoadByCharacter(disabled)).toEqual(computeLoadByCharacter(standard));

    const disabledResult = runToEnd(disabled);
    expect(disabledResult.status).toBe('completed');
  });

  it('createAttemptConfig assume "standard" quando a opção não é passada (compatibilidade)', () => {
    const config = createAttemptConfig(SCENARIO_A);
    expect(config.variabilityMode).toBe('standard');
  });

  it('duas execuções completas com "disabled" e seeds diferentes chegam ao mesmo resultado final', () => {
    const a = createAttemptConfig(SCENARIO_A, { seed: 'seed-um', variabilityMode: 'disabled' });
    const b = createAttemptConfig(SCENARIO_A, { seed: 'seed-dois', variabilityMode: 'disabled' });

    expect(runToEnd(a)).toEqual(runToEnd(b));
  });
});

describe('caso 1 — personagem isolado, sem variação', () => {
  it('chega em ceil(distância / velocidade efetiva) segundos', () => {
    // 3,6 km/h = 1 m/s, sem carga: 1000 m em exatamente 1000 s.
    const scenario = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6 }],
      distanceM: 1000,
    });
    const config = createAttemptConfig(scenario);
    const state = runToEnd(config);

    expect(state.status).toBe('completed');
    expect(state.characters.solo.arrivalTimeSec).toBe(1000);
    expect(state.elapsedSec).toBe(1000);
  });

  it('arredonda para cima quando a distância não é múltipla da velocidade', () => {
    // 1 m/s, 1000,5 m → 1001 ticks.
    const scenario = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6 }],
      distanceM: 1000.5,
    });
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.characters.solo.arrivalTimeSec).toBe(Math.ceil(1000.5 / 1));
    expect(state.characters.solo.arrivalTimeSec).toBe(1001);
  });

  it('sozinho, nunca acumula tempo limitado pela fila', () => {
    const scenario = labScenario({ characters: [{ id: 'solo', baseSpeedKmh: 3.6 }] });
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.characters.solo.limitedTimeSec).toBe(0);
    expect(state.characters.solo.stoppedByQueueTimeSec).toBe(0);
    expect(state.characters.solo.equivalentLostTimeSec).toBe(0);
  });
});

describe('caso 2 — mesma velocidade, sem variação', () => {
  it('avançam juntos, sem atraso artificial por ordem de atualização', () => {
    const scenario = labScenario({
      characters: [
        { id: 'a', baseSpeedKmh: 3.6 },
        { id: 'b', baseSpeedKmh: 3.6 },
      ],
      distanceM: 100,
    });
    const config = createAttemptConfig(scenario);
    let state = createInitialState(config);

    for (let tick = 1; tick <= 10; tick += 1) {
      state = step(config, state);
      // Usar a posição NOVA de quem está à frente evita 1 s de atraso por pessoa.
      expect(state.characters.a.positionM).toBeCloseTo(tick, 12);
      expect(state.characters.b.positionM).toBeCloseTo(tick, 12);
    }

    const final = runToEnd(config);
    expect(final.characters.a.arrivalTimeSec).toBe(100);
    expect(final.characters.b.arrivalTimeSec).toBe(100);
    expect(final.maxSpreadM).toBe(0);
  });

  it('seis personagens iguais chegam todos no mesmo tick', () => {
    const scenario = labScenario({
      characters: Array.from({ length: 6 }, (_, index) => ({
        id: 'c' + index,
        baseSpeedKmh: 3.6,
      })),
      distanceM: 300,
    });
    const state = runToEnd(createAttemptConfig(scenario));

    for (let index = 0; index < 6; index += 1) {
      expect(state.characters['c' + index].arrivalTimeSec).toBe(300);
    }
    expect(state.maxSpreadM).toBe(0);
  });
});

describe('caso 3 — rápido à frente, lento atrás', () => {
  it('surge espaço, e ninguém fica limitado', () => {
    // frente 2 m/s (7,2 km/h), atrás 1 m/s (3,6 km/h)
    const scenario = labScenario({
      characters: [
        { id: 'rapido', baseSpeedKmh: 7.2 },
        { id: 'lento', baseSpeedKmh: 3.6 },
      ],
      distanceM: 100,
      order: ['rapido', 'lento'],
    });
    const config = createAttemptConfig(scenario);
    let state = createInitialState(config);

    for (let tick = 1; tick <= 10; tick += 1) {
      state = step(config, state);
      expect(state.characters.rapido.positionM).toBeCloseTo(2 * tick, 12);
      expect(state.characters.lento.positionM).toBeCloseTo(1 * tick, 12);
    }

    // Espaço cresce 1 m por segundo.
    expect(state.characters.rapido.positionM - state.characters.lento.positionM).toBeCloseTo(10, 12);

    const final = runToEnd(config);
    expect(final.characters.rapido.arrivalTimeSec).toBe(50);
    expect(final.characters.lento.arrivalTimeSec).toBe(100);
    // O tempo total é do último: a chegada do primeiro não representa sucesso.
    expect(final.elapsedSec).toBe(100);
    expect(final.characters.lento.limitedTimeSec).toBe(0);
    expect(final.maxSpreadM).toBeCloseTo(50, 10);
  });
});

describe('caso 4 — lento à frente, rápido atrás', () => {
  it('não há ultrapassagem e o rápido acumula tempo limitado', () => {
    const scenario = labScenario({
      characters: [
        { id: 'lento', baseSpeedKmh: 3.6 },
        { id: 'rapido', baseSpeedKmh: 7.2 },
      ],
      distanceM: 100,
      order: ['lento', 'rapido'],
    });
    const config = createAttemptConfig(scenario);
    let state = createInitialState(config);

    for (let tick = 1; tick <= 50; tick += 1) {
      state = step(config, state);
      // O rápido fica colado no lento: mesma posição, sem ultrapassar.
      expect(state.characters.rapido.positionM).toBeLessThanOrEqual(
        state.characters.lento.positionM + 1e-9,
      );
      expect(state.characters.rapido.positionM).toBeCloseTo(tick, 12);
    }

    const final = runToEnd(config);
    expect(final.characters.lento.arrivalTimeSec).toBe(100);
    expect(final.characters.rapido.arrivalTimeSec).toBe(100);

    // Podia andar a 2 m/s e andou a 1 m/s durante 99 dos 100 s. No tick 100 ele
    // vai de 99 m a 100 m: quem o corta ali é o destino, não a fila — e o corte
    // por chegada não conta como limitação (§7.4).
    expect(final.characters.rapido.limitedTimeSec).toBe(99);
    expect(final.characters.lento.limitedTimeSec).toBe(0);
    // Perdeu 1 m por segundo a 2 m/s → 0,5 s equivalente em cada um dos 99 ticks.
    expect(final.characters.rapido.equivalentLostTimeSec).toBeCloseTo(49.5, 8);
    // Limitado não é o mesmo que parado: ele continuou andando.
    expect(final.characters.rapido.stoppedByQueueTimeSec).toBe(0);
    expect(final.maxSpreadM).toBe(0);
  });
});

describe('isLimited — condição do tick, não o acumulado (evolução pedagógica, frente 3)', () => {
  it('verdadeiro exatamente nos ticks em que a fila reduz o avanço, falso na chegada e para quem está livre', () => {
    const scenario = labScenario({
      characters: [
        { id: 'lento', baseSpeedKmh: 3.6 },
        { id: 'rapido', baseSpeedKmh: 7.2 },
      ],
      distanceM: 100,
      order: ['lento', 'rapido'],
    });
    const config = createAttemptConfig(scenario);
    let state = createInitialState(config);

    for (let tick = 1; tick <= 99; tick += 1) {
      state = step(config, state);
      expect(state.characters.rapido.isLimited).toBe(true);
      expect(state.characters.lento.isLimited).toBe(false);
    }

    // Tick 100: o rápido chega (99 → 100 m) — cortado pelo destino, não pela fila.
    state = step(config, state);
    expect(state.characters.rapido.arrivalTimeSec).toBe(100);
    expect(state.characters.rapido.isLimited).toBe(false);
    expect(state.characters.lento.isLimited).toBe(false);

    // Depois de chegado, isLimited nunca volta a ficar verdadeiro.
    const final = runToEnd(config);
    expect(final.characters.rapido.isLimited).toBe(false);
  });
});

describe('energia e fadiga — evolução pedagógica, frente 5', () => {
  it('EV12 — fadiga desligada (padrão) preserva o comportamento anterior: energia sempre 1, resultado idêntico', () => {
    const scenario = labScenario({ characters: [{ id: 'solo', baseSpeedKmh: 3.6 }], distanceM: 100 });
    const withDefaultFatigue = runToEnd(createAttemptConfig(scenario));
    const withExplicitDisabled = runToEnd(createAttemptConfig(scenario, { fatigueMode: 'disabled' }));

    expect(withDefaultFatigue).toEqual(withExplicitDisabled);
    expect(withDefaultFatigue.characters.solo.energy).toBe(1);
  });

  it('EV14 — caso numérico manual: consumo de energia bate com a fórmula do documento, tick a tick', () => {
    // 3,6 km/h = 1 m/s; carga = referência (loadRatio = 1); sem fila, sem
    // variação — só a fadiga muda a velocidade disponível de um tick a outro.
    const scenario = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6, referenceLoadKg: 10 }],
      loadKgByCharacter: { solo: 10 },
      distanceM: 100000,
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    const referenceSpeed = referenceSpeedMps(scenario.characters[0], 10);
    expect(referenceSpeed).toBeCloseTo(5 / 6, 10);

    let state = createInitialState(config);
    let expectedEnergy = 1;

    for (let tick = 1; tick <= 5; tick += 1) {
      const fatigue = fatigueFactor(expectedEnergy, DEFAULT_FATIGUE_PARAMS.minFatigueFactor);
      const expectedAvailable = referenceSpeed * fatigue;
      const relativeEffort = expectedAvailable / referenceSpeed; // sem fila: avanço = disponível
      const expectedLoss = DEFAULT_FATIGUE_PARAMS.drainPerSec * (1 + 0.5 * 1) * relativeEffort ** 2 * 1;
      expectedEnergy = Math.max(0, expectedEnergy - expectedLoss);

      state = step(config, state);

      expect(state.characters.solo.availableSpeedMps).toBeCloseTo(expectedAvailable, 8);
      expect(state.characters.solo.energy).toBeCloseTo(expectedEnergy, 8);
    }

    // Energia é monotonicamente decrescente aqui — cada tick prova consumo.
    expect(expectedEnergy).toBeLessThan(1);
  });

  it('EV14 — mesma carga relativa, esforço efetivo menor (limitado pela fila) perde MENOS energia', () => {
    // Reaproveita a fixture do "caso 4": lento à frente (livre, esforço 1),
    // rápido atrás, limitado ao ritmo do lento (esforço relativo 0,5) — mesma
    // carga/referência dos dois lados, então a diferença isola só o esforço.
    const scenario = labScenario({
      characters: [
        { id: 'lento', baseSpeedKmh: 3.6 },
        { id: 'rapido', baseSpeedKmh: 7.2 },
      ],
      distanceM: 100000,
      order: ['lento', 'rapido'],
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    const state = step(config, createInitialState(config));

    // lento: livre, esforço relativo 1. rápido: capado no avanço do lento,
    // que é metade da capacidade de referência do rápido — esforço 0,5.
    expect(state.characters.rapido.isLimited).toBe(true);
    const lostLento = 1 - state.characters.lento.energy;
    const lostRapido = 1 - state.characters.rapido.energy;

    expect(lostRapido).toBeGreaterThan(0);
    expect(lostRapido).toBeLessThan(lostLento);
    // Fórmula fechada: perda do rápido é exatamente 1/4 da do lento
    // (esforço 0,5 ao quadrado), mesma carga relativa dos dois lados.
    expect(lostRapido).toBeCloseTo(lostLento * 0.25, 10);
  });

  it('EV14/§7.5 — carga relativa maior, sob o mesmo esforço relativo, perde mais energia', () => {
    // Dois personagens livres (sem fila — cada um sozinho na própria
    // simulação), mesma velocidade base, cargas diferentes. Livres, os dois
    // têm esforço relativo 1 (avanço = disponível) — só a carga difere.
    const leve = labScenario({
      characters: [{ id: 'x', baseSpeedKmh: 3.6, referenceLoadKg: 10 }],
      loadKgByCharacter: { x: 5 }, // loadRatio 0,5
      distanceM: 100000,
    });
    const pesado = labScenario({
      characters: [{ id: 'x', baseSpeedKmh: 3.6, referenceLoadKg: 10 }],
      loadKgByCharacter: { x: 20 }, // loadRatio 2,0
      distanceM: 100000,
    });

    const configLeve = createAttemptConfig(leve, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });
    const configPesado = createAttemptConfig(pesado, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    const stateLeve = step(configLeve, createInitialState(configLeve));
    const statePesado = step(configPesado, createInitialState(configPesado));

    const lostLeve = 1 - stateLeve.characters.x.energy;
    const lostPesado = 1 - statePesado.characters.x.energy;

    expect(lostPesado).toBeGreaterThan(lostLeve);
  });

  it('sem avanço (já chegado antes do tick) não acumula desgaste — energia fica igual', () => {
    // "Caso 3": rápido à frente chega bem antes do lento; depois de chegar,
    // continua "esperando" por vários ticks enquanto o lento ainda anda.
    const scenario = labScenario({
      characters: [
        { id: 'rapido', baseSpeedKmh: 7.2 },
        { id: 'lento', baseSpeedKmh: 3.6 },
      ],
      distanceM: 100,
      order: ['rapido', 'lento'],
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    let state = createInitialState(config);
    while (state.characters.rapido.arrivalTimeSec === null) {
      state = step(config, state);
    }
    const energyAtArrival = state.characters.rapido.energy;
    expect(energyAtArrival).toBeLessThan(1); // gastou energia chegando lá

    while (state.status === 'running') {
      state = step(config, state);
      // Depois de chegado, nenhum desgaste adicional — mesma energia de quando chegou.
      expect(state.characters.rapido.energy).toBe(energyAtArrival);
    }
    expect(state.characters.lento.arrivalTimeSec).not.toBeNull();
  });

  it('energia nunca sai de [0, 1] e nunca aumenta, tick a tick', () => {
    const scenario = labScenario({
      characters: [
        { id: 'a', baseSpeedKmh: 3.6 },
        { id: 'b', baseSpeedKmh: 4.8 },
      ],
      distanceM: 500,
      order: ['a', 'b'],
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    let state = createInitialState(config);
    const previousEnergy: Record<string, number> = { a: 1, b: 1 };

    while (state.status === 'running') {
      state = step(config, state);
      for (const id of ['a', 'b']) {
        const energy = state.characters[id].energy;
        expect(energy).toBeGreaterThanOrEqual(0);
        expect(energy).toBeLessThanOrEqual(1);
        expect(energy).toBeLessThanOrEqual(previousEnergy[id] + 1e-12);
        previousEnergy[id] = energy;
      }
    }
  });

  it('reiniciar (createInitialState) sempre repõe a energia em 1 — nunca herda desgaste de outra configuração', () => {
    const scenario = labScenario({ characters: [{ id: 'solo', baseSpeedKmh: 3.6 }], distanceM: 100000 });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: DEFAULT_FATIGUE_PARAMS });

    let state = createInitialState(config);
    for (let tick = 0; tick < 20; tick += 1) state = step(config, state);
    expect(state.characters.solo.energy).toBeLessThan(1);

    // Uma nova tentativa (nova chamada a createInitialState) começa do zero.
    const restarted = createInitialState(config);
    expect(restarted.characters.solo.energy).toBe(1);
  });

  it('energia zero preserva o piso de capacidade (minFatigueFactor) — não trava nem para o personagem', () => {
    const aggressiveParams: FatigueParams = {
      version: 'test-aggressive',
      drainPerSec: 0.5,
      loadDrainCoefficient: 0,
      minFatigueFactor: 0.6,
    };
    const scenario = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6, referenceLoadKg: 10 }],
      loadKgByCharacter: { solo: 0 },
      distanceM: 100000,
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: aggressiveParams });
    const referenceSpeed = referenceSpeedMps(scenario.characters[0], 0);

    let state = createInitialState(config);
    for (let tick = 0; tick < 10; tick += 1) state = step(config, state);

    expect(state.characters.solo.energy).toBe(0);
    // No piso, a velocidade disponível é referenceSpeed × minFatigueFactor —
    // nunca menos, e o personagem continua avançando (sem parar).
    expect(state.characters.solo.availableSpeedMps).toBeCloseTo(referenceSpeed * 0.6, 8);
    expect(state.characters.solo.actualSpeedMps).toBeGreaterThan(0);

    const nextState = step(config, state);
    expect(nextState.characters.solo.energy).toBe(0); // não fica negativo
    expect(nextState.characters.solo.actualSpeedMps).toBeGreaterThan(0); // continua andando
  });

  it('velocidade disponível nunca aumenta por perda de energia, com carga e flutuação fixas (§7.5)', () => {
    const character = { id: 'x', displayName: 'X', baseSpeedKmh: 4.5, referenceLoadKg: 10, maxLoadKg: 30, variability: 0 };
    const loadKg = 8;
    const params = DEFAULT_FATIGUE_PARAMS;

    const speedAtFullEnergy = availableSpeedMps(character, loadKg, 'seed', 0, 30, 'standard', {
      energy: 1,
      fatigueMode: 'enabled',
      fatigueParams: params,
    });
    const speedAtHalfEnergy = availableSpeedMps(character, loadKg, 'seed', 0, 30, 'standard', {
      energy: 0.5,
      fatigueMode: 'enabled',
      fatigueParams: params,
    });
    const speedAtNoEnergy = availableSpeedMps(character, loadKg, 'seed', 0, 30, 'standard', {
      energy: 0,
      fatigueMode: 'enabled',
      fatigueParams: params,
    });

    expect(speedAtHalfEnergy).toBeLessThan(speedAtFullEnergy);
    expect(speedAtNoEnergy).toBeLessThan(speedAtHalfEnergy);
  });

  it('validação dos parâmetros: drainPerSec > 0, loadDrainCoefficient >= 0, 0 < minFatigueFactor <= 1', async () => {
    const { validateFatigueParams } = await import('@/features/trail/domain/fatigue');

    expect(validateFatigueParams(DEFAULT_FATIGUE_PARAMS).valid).toBe(true);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, drainPerSec: 0 }).valid).toBe(false);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, drainPerSec: -1 }).valid).toBe(false);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, loadDrainCoefficient: -0.1 }).valid).toBe(false);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, loadDrainCoefficient: 0 }).valid).toBe(true);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, minFatigueFactor: 0 }).valid).toBe(false);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, minFatigueFactor: 1.5 }).valid).toBe(false);
    expect(validateFatigueParams({ ...DEFAULT_FATIGUE_PARAMS, minFatigueFactor: 1 }).valid).toBe(true);
  });
});

describe('caso 5 — corte por chegada não conta como limitação', () => {
  it('o último metro não gera tempo limitado', () => {
    // 10 m/s, 15 m: no tick 2 ele chegaria a 20 m, mas é cortado em 15 m.
    const scenario = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 36 }],
      distanceM: 15,
    });
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.characters.solo.arrivalTimeSec).toBe(2);
    expect(state.characters.solo.limitedTimeSec).toBe(0);
    expect(state.characters.solo.equivalentLostTimeSec).toBe(0);
  });

  it('quem vem atrás de alguém que já chegou não é limitado por ele', () => {
    const scenario = labScenario({
      characters: [
        { id: 'frente', baseSpeedKmh: 36 },
        { id: 'tras', baseSpeedKmh: 3.6 },
      ],
      distanceM: 20,
      order: ['frente', 'tras'],
    });
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.characters.frente.arrivalTimeSec).toBe(2);
    expect(state.characters.tras.arrivalTimeSec).toBe(20);
    expect(state.characters.tras.limitedTimeSec).toBe(0);
  });
});

describe('caso 6 — distribuição de mochila', () => {
  it('conserva os itens e o peso total ao transferir', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const loads = computeLoadByCharacter(config);
    const total = Object.values(loads).reduce((sum, value) => sum + value, 0);

    expect(total).toBe(48);
    expect(config.scenario.items).toHaveLength(48);
    expect(loads.p5).toBe(18);
    expect(loads.p1).toBe(6);
  });

  it('aplica a fórmula de carga a cada personagem', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const p5 = config.scenario.characters.find((character) => character.id === 'p5')!;
    const speed = availableSpeedMps(p5, 18, 'seed', 0, 30);
    const semVariacao = kmhToMps(2.8125);

    // Com variabilidade 0,2 a velocidade fica em ±20% do valor sem variação.
    expect(speed).toBeGreaterThan(semVariacao * 0.8 - 1e-12);
    expect(speed).toBeLessThan(semVariacao * 1.2 + 1e-12);
  });
});

describe('caso 7 — carga zero e carga máxima', () => {
  it('produz resultados finitos, positivos e coerentes', () => {
    const scenario = labScenario({
      characters: [
        { id: 'vazio', baseSpeedKmh: 4.5, referenceLoadKg: 6 },
        { id: 'cheio', baseSpeedKmh: 4.5, referenceLoadKg: 6 },
      ],
      distanceM: 500,
      loadKgByCharacter: { vazio: 0, cheio: 18 },
      order: ['vazio', 'cheio'],
    });
    const config = createAttemptConfig(scenario);
    const state = runToEnd(config);

    const vazio = state.characters.vazio.arrivalTimeSec!;
    const cheio = state.characters.cheio.arrivalTimeSec!;

    expect(Number.isFinite(vazio)).toBe(true);
    expect(Number.isFinite(cheio)).toBe(true);
    expect(vazio).toBeGreaterThan(0);
    // Carga máxima é mais lenta: 4,5 km/h → 2,8125 km/h.
    expect(cheio).toBeGreaterThan(vazio);
    expect(vazio).toBe(Math.ceil(500 / kmhToMps(4.5)));
    expect(cheio).toBe(Math.ceil(500 / kmhToMps(2.8125)));
  });
});

describe('caso 8 — chegada exatamente no limite', () => {
  it('conta como concluída, não como timeout', () => {
    // 1 m/s, 100 m → chega em 100 s. Limite: exatamente 100 s.
    const base = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6 }],
      distanceM: 100,
    });
    const scenario = { ...base, timeLimitSec: 100 };
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.status).toBe('completed');
    expect(state.elapsedSec).toBe(100);
    expect(state.characters.solo.arrivalTimeSec).toBe(100);
  });
});

describe('caso 9 — timeout antes de todos chegarem', () => {
  it('encerra com status próprio e progresso parcial', () => {
    const base = labScenario({
      characters: [{ id: 'solo', baseSpeedKmh: 3.6 }],
      distanceM: 1000,
    });
    const scenario = { ...base, timeLimitSec: 300 };
    const state = runToEnd(createAttemptConfig(scenario));

    expect(state.status).toBe('timed_out');
    expect(state.elapsedSec).toBe(300);
    expect(state.characters.solo.arrivalTimeSec).toBeNull();
    expect(state.characters.solo.positionM).toBeCloseTo(300, 9);
  });
});

describe('invariantes gerais no cenário A', () => {
  const config = createAttemptConfig(SCENARIO_A);

  it('AC02 — ninguém ultrapassa seu predecessor em nenhum tick', () => {
    let state = createInitialState(config);

    while (state.status === 'running') {
      state = step(config, state);

      for (let index = 1; index < config.order.length; index += 1) {
        const ahead = state.characters[config.order[index - 1]].positionM;
        const behind = state.characters[config.order[index]].positionM;
        expect(behind).toBeLessThanOrEqual(ahead + 1e-9);
      }
    }
  });

  it('as posições nunca retrocedem nem passam do destino', () => {
    let state = createInitialState(config);
    let previous = state;

    while (state.status === 'running') {
      state = step(config, state);

      for (const characterId of config.order) {
        expect(state.characters[characterId].positionM).toBeGreaterThanOrEqual(
          previous.characters[characterId].positionM - 1e-9,
        );
        expect(state.characters[characterId].positionM).toBeLessThanOrEqual(
          config.scenario.distanceM + 1e-9,
        );
      }

      previous = state;
    }
  });

  it('AC04 — mesma seed e configuração produzem estados finais idênticos', () => {
    const first = runToEnd(createAttemptConfig(SCENARIO_A));
    const second = runToEnd(createAttemptConfig(SCENARIO_A));
    expect(first).toEqual(second);
  });

  it('step não muta suas entradas', () => {
    const state = createInitialState(config);
    const snapshot = structuredClone(state);
    const configSnapshot = structuredClone(config);

    step(config, state);

    expect(state).toEqual(snapshot);
    expect(config).toEqual(configSnapshot);
  });

  it('AC05 — mudar a ordem não altera os sorteios do personagem', () => {
    // p5 vai da terceira para a primeira posição. Sua carga é a mesma, então
    // sua velocidade disponível em cada tick precisa ser idêntica.
    const original = createAttemptConfig(SCENARIO_A);
    const reordered = createAttemptConfig(SCENARIO_A, {
      order: ['p5', 'p1', 'p2', 'p3', 'p4', 'p6'],
    });

    const speedsOriginal: number[] = [];
    const speedsReordered: number[] = [];

    let stateA = createInitialState(original);
    let stateB = createInitialState(reordered);

    for (let tick = 0; tick < 200; tick += 1) {
      stateA = step(original, stateA);
      stateB = step(reordered, stateB);
      speedsOriginal.push(stateA.characters.p5.availableSpeedMps);
      speedsReordered.push(stateB.characters.p5.availableSpeedMps);
    }

    expect(speedsReordered).toEqual(speedsOriginal);
  });

  it('AC06/AC14 — executar tick a tick coincide com runToEnd', () => {
    const manual = (() => {
      let state = createInitialState(config);
      while (state.status === 'running') {
        state = step(config, state);
      }
      return state;
    })();

    expect(manual).toEqual(runToEnd(config));
  });

  it('R06/R15 — renomear o personagem não muda seu resultado', () => {
    // O ID participa do sorteio; o nome de exibição, não. Trocar apenas o rótulo
    // precisa produzir exatamente o mesmo resultado.
    const renamed = structuredClone(SCENARIO_A);
    renamed.characters = renamed.characters.map((character) => ({
      ...character,
      displayName: 'Outro nome ' + character.id,
    }));

    const baseline = runToEnd(createAttemptConfig(SCENARIO_A));
    const withNames = runToEnd(createAttemptConfig(renamed));

    expect(withNames.elapsedSec).toBe(baseline.elapsedSec);
    expect(withNames.characters).toEqual(baseline.characters);
  });

  it('o nome do participante não influencia a física', () => {
    const withParticipants = createAttemptConfig(SCENARIO_A, {
      participantByCharacter: { p1: 'Ana', p5: 'Bruno' },
      hypothesis: 'Aliviar o p5 deve ajudar.',
    });

    expect(runToEnd(withParticipants).characters).toEqual(
      runToEnd(createAttemptConfig(SCENARIO_A)).characters,
    );
  });

  it('todos os seis personagens participam exatamente uma vez (R01)', () => {
    expect(new Set(config.order).size).toBe(6);
    expect(config.order).toHaveLength(config.scenario.characters.length);
  });
});

describe('dispersão', () => {
  it('a dispersão final tende a zero, mas a máxima registra o histórico', () => {
    const state = runToEnd(createAttemptConfig(SCENARIO_A));
    const positions = Object.values(state.characters).map((character) => character.positionM);
    const finalSpread = Math.max(...positions) - Math.min(...positions);

    expect(finalSpread).toBeCloseTo(0, 9);
    expect(state.maxSpreadM).toBeGreaterThan(0);
  });
});

describe('configuração', () => {
  it('cria a tentativa com a versão do motor e o passo fixos', () => {
    const config: AttemptConfig = createAttemptConfig(SCENARIO_A);
    expect(config.engineVersion).toBe(ENGINE_VERSION);
    expect(config.tickSec).toBe(TICK_SEC);
  });

  it('o snapshot do cenário não compartilha referência mutável', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.characters[0].baseSpeedKmh = 99;
    expect(SCENARIO_A.characters[0].baseSpeedKmh).toBe(4.8);

    const order: CharacterId[] = config.order;
    order.push('intruso');
    expect(SCENARIO_A.initialOrder).toHaveLength(6);
  });
});
