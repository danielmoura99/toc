import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_COMPARISON_SELECTION, MAX_HISTORY_SIZE, useHistoryStore } from '@/features/factory/application/historyStore';
import { createProductionLineConfig } from '@/features/factory/domain/config';
import { runToEnd } from '@/features/factory/domain/engine';

const store = useHistoryStore;

beforeEach(() => {
  store.setState({ history: [], selectedForComparison: [], pendingRun: null });
});

function run(seed: string) {
  const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed });
  return { config, finalState: runToEnd(config) };
}

describe('recordRun', () => {
  it('grava uma partida concluída com metadados e resumo', () => {
    const { config, finalState } = run('a');
    const outcome = store.getState().recordRun(config, finalState);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.run.id).toBeTruthy();
    expect(outcome.run.summary.delivered).toBe(finalState.delivered);
    expect(store.getState().history).toHaveLength(1);
  });

  it('ao atingir 20, a próxima gravação fica pendente em vez de descartada', () => {
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      const { config, finalState } = run(`seed-${i}`);
      store.getState().recordRun(config, finalState);
    }
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);

    const { config, finalState } = run('overflow');
    const outcome = store.getState().recordRun(config, finalState);
    expect(outcome.ok).toBe(false);
    expect(store.getState().pendingRun?.id).toBe(outcome.run.id);
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
  });

  it('remover uma partida abre espaço para a pendente entrar automaticamente', () => {
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      const { config, finalState } = run(`seed-${i}`);
      store.getState().recordRun(config, finalState);
    }
    const { config, finalState } = run('overflow');
    store.getState().recordRun(config, finalState);
    expect(store.getState().pendingRun).not.toBeNull();

    const idToRemove = store.getState().history[0].id;
    store.getState().removeRun(idToRemove);

    expect(store.getState().pendingRun).toBeNull();
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    expect(store.getState().history.some((r) => r.id === idToRemove)).toBe(false);
  });
});

describe('toggleComparisonSelection', () => {
  it('seleciona até 3; a quarta desloca a mais antiga', () => {
    store.getState().toggleComparisonSelection('r1');
    store.getState().toggleComparisonSelection('r2');
    store.getState().toggleComparisonSelection('r3');
    expect(store.getState().selectedForComparison).toEqual(['r1', 'r2', 'r3']);

    store.getState().toggleComparisonSelection('r4');
    expect(store.getState().selectedForComparison).toHaveLength(MAX_COMPARISON_SELECTION);
    expect(store.getState().selectedForComparison).toEqual(['r2', 'r3', 'r4']);
  });

  it('selecionar de novo remove', () => {
    store.getState().toggleComparisonSelection('r1');
    store.getState().toggleComparisonSelection('r1');
    expect(store.getState().selectedForComparison).toEqual([]);
  });
});

describe('hydrateHistory', () => {
  it('substitui o histórico e aplica a pendente se houver espaço', () => {
    const { config, finalState } = run('hydrate-1');
    const recorded = store.getState().recordRun(config, finalState);
    if (!recorded.ok) throw new Error('setup falhou');

    const { config: c2, finalState: f2 } = run('hydrate-2');
    const pending = { id: 'pending-1', createdAt: new Date().toISOString(), config: c2, finalState: f2, summary: store.getState().history[0].summary };

    store.getState().hydrateHistory([recorded.run], pending);
    expect(store.getState().history.map((r) => r.id)).toEqual([recorded.run.id, 'pending-1']);
    expect(store.getState().pendingRun).toBeNull();
  });
});
