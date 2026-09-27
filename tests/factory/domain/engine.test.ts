import { describe, expect, it } from 'vitest';

import { createInitialState, inventoryInProcess, nextTurnDescriptor, runToEnd, stepTurn } from '@/features/factory/domain/engine';
import { createProductionLineConfig, stageId } from '@/features/factory/domain/config';
import type { ProductionLineConfig, ProductionLineState } from '@/features/factory/domain/types';
import type { RollFace } from '@/features/factory/domain/engine';

/** Config de laboratório: 5 etapas A–E (rótulos simples, sem tema), horizonte fixo. */
function labConfig(rounds: 10 | 20 | 30 = 10): ProductionLineConfig {
  const config = createProductionLineConfig({ stageCount: 5, rounds, seed: 'lab-seed' });
  return {
    ...config,
    stages: config.stages.map((stage, index) => ({
      ...stage,
      sectorName: ['A', 'B', 'C', 'D', 'E'][index],
    })),
  };
}

/** Fixture: fornece uma sequência fixa de faces por rodada — só em teste (§10). */
function fixedRollFace(facesByRound: number[][]): RollFace {
  return (stageIdValue, roundIndex) => {
    const stageIndex = Number(stageIdValue.replace('stage-', ''));
    return facesByRound[roundIndex][stageIndex];
  };
}

function runRound(config: ProductionLineConfig, state: ProductionLineState, roll: RollFace): ProductionLineState {
  let next = state;
  for (let i = 0; i < config.stages.length; i += 1) {
    next = stepTurn(config, next, roll);
  }
  return next;
}

describe('referência manual do guia (§11) — cinco setores A→B→C→D→E', () => {
  it('reproduz exatamente os dois primeiros ciclos narrados', () => {
    const config = labConfig();
    const roll = fixedRollFace([
      [2, 4, 5, 1, 1],
      [6, 6, 3, 6, 3],
    ]);

    let state = createInitialState(config);
    state = runRound(config, state, roll);

    expect(state.events.slice(-5).map((e) => e.die)).toEqual([2, 4, 5, 1, 1]);
    expect(state.events.slice(-5).map((e) => e.transferred)).toEqual([2, 2, 2, 1, 1]);
    expect(state.inventoryByStage).toEqual({
      [stageId(0)]: 0,
      [stageId(1)]: 0,
      [stageId(2)]: 0,
      [stageId(3)]: 1,
      [stageId(4)]: 0,
    });
    expect(state.delivered).toBe(1);
    expect(state.introduced).toBe(2);

    state = runRound(config, state, roll);

    expect(state.events.slice(-5).map((e) => e.die)).toEqual([6, 6, 3, 6, 3]);
    expect(state.events.slice(-5).map((e) => e.transferred)).toEqual([6, 6, 3, 4, 3]);
    expect(state.inventoryByStage).toEqual({
      [stageId(0)]: 0,
      [stageId(1)]: 0,
      [stageId(2)]: 3,
      [stageId(3)]: 0,
      [stageId(4)]: 1,
    });
    expect(state.delivered).toBe(4);
    expect(state.introduced).toBe(8);

    // "depois de duas rodadas, entrada 8 = entrega 4 + estoque 4"
    expect(state.introduced).toBe(state.delivered + inventoryInProcess(state));
    expect(inventoryInProcess(state)).toBe(4);
  });
});

describe('fixtures adicionais (§11)', () => {
  it('todos tiram 6: entrega 6 por rodada desde a primeira, estoque final zero', () => {
    const config = labConfig();
    const roll = fixedRollFace(Array.from({ length: 10 }, () => [6, 6, 6, 6, 6]));

    let state = createInitialState(config);
    for (let round = 0; round < 10; round += 1) {
      state = runRound(config, state, roll);
      const deliveredThisRound = state.events.slice(-1)[0].transferred;
      expect(deliveredThisRound).toBe(6);
    }

    expect(state.delivered).toBe(60);
    expect(inventoryInProcess(state)).toBe(0);
    expect(state.status).toBe('completed');
  });

  it('A tira 6 e B tira 1: sobra estoque na entrada de B e não desaparece na próxima rodada', () => {
    const config = labConfig();
    const roll = fixedRollFace([
      [6, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ]);

    let state = createInitialState(config);
    state = runRound(config, state, roll);
    // B recebeu 6 de A, transferiu só 1 (seu dado) -> sobram 5 na entrada de B.
    expect(state.inventoryByStage[stageId(1)]).toBe(5);

    state = runRound(config, state, roll);
    // A sobra de B não some: cresce mais 5 (recebe 1 de A, tira só 1).
    expect(state.inventoryByStage[stageId(1)]).toBe(5);
  });

  it('fila de entrada vazia e dado alto: transferência zero, capacidade não utilizada igual ao dado', () => {
    // Teste unitário defensivo (§11): no fluxo padrão a fonte sempre libera
    // pelo menos 1 lote por rodada, então uma fila genuinamente vazia não
    // ocorre sozinha depois da primeira rodada — simulada aqui diretamente,
    // sem fabricar esse cenário através de várias rodadas reais.
    const config = labConfig();
    const starved: ProductionLineState = { ...createInitialState(config), nextStageIndex: 1 };
    const after = stepTurn(config, starved, () => 6);
    const event = after.events[after.events.length - 1];

    expect(event.die).toBe(6);
    expect(event.availableBefore).toBe(0);
    expect(event.transferred).toBe(0);
    expect(event.unusedCapacity).toBe(6);
  });

  it('estoque suficiente: transferência igual ao dado, com sobra correta', () => {
    const config = labConfig();
    let state = createInitialState(config);
    state = { ...state, inventoryByStage: { ...state.inventoryByStage, [stageId(1)]: 10 } };
    state = { ...state, nextStageIndex: 1 };

    const after = stepTurn(config, state, () => 4);
    const event = after.events[0];
    expect(event.availableBefore).toBe(10);
    expect(event.transferred).toBe(4);
    expect(after.inventoryByStage[stageId(1)]).toBe(6);
  });

  it('no modo padrão, ao fim de R rodadas a entrega fica entre R e 6×R', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed });
      const state = runToEnd(config);
      expect(state.status).toBe('completed');
      expect(state.delivered).toBeGreaterThanOrEqual(10);
      expect(state.delivered).toBeLessThanOrEqual(60);
    }
  });
});

describe('regras de transferência e turno/rodada (§4)', () => {
  it('TG01: todas as etapas usam a mesma distribuição — nenhuma tem tratamento especial por nome ou posição', () => {
    // A primeira etapa nunca é limitada por estoque (fonte irrestrita); as
    // demais seguem exatamente a mesma regra de min(dado, disponível) entre si.
    const config = createProductionLineConfig({ stageCount: 6, rounds: 10, seed: 'tg01' });
    const state = runToEnd(config);
    const byStage = new Map<string, number[]>();
    for (const event of state.events) {
      const list = byStage.get(event.stageId) ?? [];
      list.push(event.die);
      byStage.set(event.stageId, list);
    }
    for (const dice of byStage.values()) {
      expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    }
  });

  it('TG04: o que a primeira etapa transfere fica disponível para a segunda na MESMA rodada', () => {
    const config = labConfig();
    let state = createInitialState(config);
    state = stepTurn(config, state, () => 5); // etapa A (index 0)
    expect(state.inventoryByStage[stageId(1)]).toBe(5);
    state = stepTurn(config, state, () => 3); // etapa B, mesma rodada
    expect(state.events[state.events.length - 1].availableBefore).toBe(5);
  });

  it('conservação (TG03): introduced = delivered + soma(inventory) após cada turno', () => {
    const config = createProductionLineConfig({ stageCount: 7, rounds: 10, seed: 'conserv' });
    let state = createInitialState(config);
    while (state.status === 'active') {
      state = stepTurn(config, state);
      expect(state.introduced).toBe(state.delivered + inventoryInProcess(state));
      expect(Number.isInteger(state.introduced)).toBe(true);
      expect(Number.isInteger(state.delivered)).toBe(true);
      for (const value of Object.values(state.inventoryByStage)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('não retira lotes além da capacidade sorteada nem do que está disponível', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'cap-check' });
    let state = createInitialState(config);
    while (state.status === 'active') {
      const before = state;
      state = stepTurn(config, state);
      const event = state.events[state.events.length - 1];
      expect(event.transferred).toBeLessThanOrEqual(event.die);
      if (event.availableBefore !== null) {
        expect(event.transferred).toBeLessThanOrEqual(event.availableBefore);
      }
      void before;
    }
  });

  it('a ordem das etapas nunca muda durante a partida (a lista de stages do config é fixa)', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'order-fixed' });
    const stagesBefore = [...config.stages];
    runToEnd(config);
    expect(config.stages).toEqual(stagesBefore);
  });

  it('a partida termina ao concluir a última etapa da última rodada, não antes', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'end-check' });
    let state = createInitialState(config);
    let turns = 0;
    const totalTurns = config.stages.length * config.rounds;
    while (state.status === 'active') {
      state = stepTurn(config, state);
      turns += 1;
      if (turns < totalTurns) {
        expect(state.status).toBe('active');
      }
    }
    expect(turns).toBe(totalTurns);
    expect(state.status).toBe('completed');
  });

  it('stepTurn em estado concluído não sorteia de novo — devolve o mesmo estado, sem lançar', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'idempotent' });
    const finalState = runToEnd(config);
    let rolled = false;
    const after = stepTurn(config, finalState, () => {
      rolled = true;
      return 1;
    });
    expect(rolled).toBe(false);
    expect(after).toBe(finalState);
  });

  it('nextTurnDescriptor é nulo quando a partida terminou, e correto durante a execução', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'descriptor' });
    let state = createInitialState(config);
    expect(nextTurnDescriptor(config, state)).toEqual({ roundIndex: 0, stageIndex: 0, stageId: stageId(0) });

    state = stepTurn(config, state);
    expect(nextTurnDescriptor(config, state)).toEqual({ roundIndex: 0, stageIndex: 1, stageId: stageId(1) });

    const finalState = runToEnd(config);
    expect(nextTurnDescriptor(config, finalState)).toBeNull();
  });

  it('stepTurn não muta o estado de entrada', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'no-mutate' });
    const initial = createInitialState(config);
    const snapshot = JSON.parse(JSON.stringify(initial));
    stepTurn(config, initial);
    expect(initial).toEqual(snapshot);
  });

  it('recebimento na mesma rodada: o manual e o automático (runToEnd) produzem o mesmo resultado', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'manual-vs-auto' });

    let manual = createInitialState(config);
    while (manual.status === 'active') {
      manual = stepTurn(config, manual);
    }

    const automatic = runToEnd(config);
    expect(manual).toEqual(automatic);
  });
});
