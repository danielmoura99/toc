import { beforeEach, describe, expect, it } from 'vitest';

import { useAttemptsStore } from '@/features/trail/application/attemptsStore';
import { attemptLabel, orderAttemptsForComparison } from '@/features/trail/application/comparisonOrdering';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { SCENARIO_A } from '@/features/trail/scenarios';
import type { AttemptResult, GuidedStage } from '@/features/trail/domain/types';

const store = useAttemptsStore;

function record(seed: string, guidedStage: GuidedStage): AttemptResult {
  const config = createAttemptConfig(SCENARIO_A, { seed, guidedStage });
  const result = store.getState().recordAttempt(config, runToEnd(config));
  if (!result.ok) throw new Error('gravação deveria ter sucesso');
  return result.attempt;
}

beforeEach(() => {
  store.setState({ history: [], referenceAttemptId: null, selectedForComparison: [], pendingAttempt: null });
});

describe('orderAttemptsForComparison', () => {
  it('reproduz o caso do relatório: seleção fora de ordem não deve ditar a numeração', () => {
    // Ordem real de conclusão: inicial (1) → reorganização (2) → redistribuição (3).
    const initial = record('seed-1', 1);
    const reorganizada = record('seed-2', 2);
    const redistribuida = record('seed-3', 3);
    const history = store.getState().history;

    // A seleção clicou fora de ordem: redistribuída antes de reorganizada.
    const selectedOutOfOrder = [initial, redistribuida, reorganizada];

    const ordered = orderAttemptsForComparison(selectedOutOfOrder, history, initial.id);

    expect(ordered.map((attempt) => attempt.id)).toEqual([initial.id, reorganizada.id, redistribuida.id]);
  });

  it('referência selecionada vai sempre primeiro, mesmo escolhida por último', () => {
    const a = record('seed-a', 1);
    const b = record('seed-b', 2);
    const history = store.getState().history;

    const ordered = orderAttemptsForComparison([b, a], history, a.id);
    expect(ordered[0].id).toBe(a.id);
  });

  it('sem referência na seleção, a primeira tentativa escolhida continua sendo a base', () => {
    const a = record('seed-a', 1);
    const b = record('seed-b', 2);
    const c = record('seed-c', 3);
    const history = store.getState().history;

    // b foi clicada primeiro, mesmo não sendo a mais antiga cronologicamente.
    const ordered = orderAttemptsForComparison([b, a, c], history, null);
    expect(ordered[0].id).toBe(b.id);
    // As demais (a, c) continuam em ordem cronológica.
    expect(ordered.slice(1).map((attempt) => attempt.id)).toEqual([a.id, c.id]);
  });

  it('lista vazia sem seleção nenhuma', () => {
    expect(orderAttemptsForComparison([], [], null)).toEqual([]);
  });
});

describe('attemptLabel', () => {
  it('usa a posição cronológica no histórico, não a posição na lista recebida', () => {
    const a = record('seed-a', 1);
    const b = record('seed-b', 2);
    const c = record('seed-c', 3);
    const history = store.getState().history;

    expect(attemptLabel(a, history, true)).toBe('Tentativa 1 · Observar — Referência');
    expect(attemptLabel(b, history, false)).toBe('Tentativa 2 · Reorganizar');
    expect(attemptLabel(c, history, false)).toBe('Tentativa 3 · Redistribuir');
  });
});
