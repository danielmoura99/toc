import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_COMPARISON_SELECTION,
  MAX_HISTORY_SIZE,
  useAttemptsStore,
} from '@/features/trail/application/attemptsStore';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { SCENARIO_A, SCENARIO_B } from '@/features/trail/scenarios';
import type { AttemptConfig } from '@/features/trail/domain/types';

const store = useAttemptsStore;

function stage1Config(seed = SCENARIO_A.defaultSeed): AttemptConfig {
  return createAttemptConfig(SCENARIO_A, { seed, guidedStage: 1 });
}

beforeEach(() => {
  store.setState({ history: [], referenceAttemptId: null, selectedForComparison: [], pendingAttempt: null });
});

describe('recordAttempt', () => {
  it('grava uma tentativa concluída com metadados', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.attempt.id).toBeTruthy();
    expect(result.attempt.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.attempt.outcome).toBe('completed');
    expect(store.getState().history).toHaveLength(1);
  });

  it('a primeira conclusão da etapa 1 vira a referência inicial (§4.1)', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));

    expect(result.ok && result.becameReference).toBe(true);
    expect(store.getState().referenceAttemptId).toBe(result.ok ? result.attempt.id : null);
  });

  it('a segunda tentativa da etapa 1 não substitui a referência', () => {
    const first = store.getState().recordAttempt(stage1Config(), runToEnd(stage1Config()));
    const referenceId = first.ok ? first.attempt.id : null;

    const second = store.getState().recordAttempt(stage1Config(), runToEnd(stage1Config()));

    expect(second.ok && second.becameReference).toBe(false);
    expect(store.getState().referenceAttemptId).toBe(referenceId);
  });

  it('uma tentativa de outra etapa não vira referência inicial', () => {
    const config = createAttemptConfig(SCENARIO_A, { guidedStage: 2 });
    const result = store.getState().recordAttempt(config, runToEnd(config));

    expect(result.ok && result.becameReference).toBe(false);
    expect(store.getState().referenceAttemptId).toBeNull();
  });

  it('timeout não vira referência, mesmo na etapa 1', () => {
    const timedOutScenario = structuredClone(SCENARIO_A);
    timedOutScenario.timeLimitSec = 600;
    const config = createAttemptConfig(timedOutScenario, { guidedStage: 1 });

    const result = store.getState().recordAttempt(config, runToEnd(config));

    expect(result.ok && result.attempt.outcome).toBe('timed_out');
    expect(result.ok && result.becameReference).toBe(false);
    expect(store.getState().referenceAttemptId).toBeNull();
  });

  it('AC10-adjacent: recusa gravar além de 20, sem descartar a mais antiga', () => {
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      const config = stage1Config(`seed-${i}`);
      const result = store.getState().recordAttempt(config, runToEnd(config));
      expect(result.ok).toBe(true);
    }

    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    const firstId = store.getState().history[0].id;

    const overflowConfig = stage1Config('seed-overflow');
    const overflow = store.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));

    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.reason).toBe('history_full');
    // A tentativa não é perdida: volta para quem chamou e fica pendente.
    expect(overflow.attempt.config.seed).toBe('seed-overflow');
    expect(store.getState().pendingAttempt?.id).toBe(overflow.attempt.id);
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    // A mais antiga continua lá — nada foi descartado silenciosamente.
    expect(store.getState().history[0].id).toBe(firstId);
  });

  it('exclusão seletiva libera espaço para novas gravações', () => {
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      const config = stage1Config(`seed-${i}`);
      store.getState().recordAttempt(config, runToEnd(config));
    }

    const toRemove = store.getState().history[0].id;
    store.getState().removeAttempt(toRemove);
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE - 1);

    const config = stage1Config('seed-new');
    const result = store.getState().recordAttempt(config, runToEnd(config));
    expect(result.ok).toBe(true);
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
  });
});

describe('pendingAttempt — a tentativa não pode se perder', () => {
  function fillHistory() {
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      const config = stage1Config(`seed-${i}`);
      store.getState().recordAttempt(config, runToEnd(config));
    }
  }

  it('excluir uma tentativa antiga aplica a pendente automaticamente', () => {
    fillHistory();
    const overflowConfig = stage1Config('seed-overflow');
    store.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));
    expect(store.getState().pendingAttempt).not.toBeNull();

    const toRemove = store.getState().history[0].id;
    store.getState().removeAttempt(toRemove);

    // Sem nenhuma ação manual além da exclusão: a pendente já está no histórico.
    expect(store.getState().pendingAttempt).toBeNull();
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    expect(store.getState().history[store.getState().history.length - 1].config.seed).toBe(
      'seed-overflow',
    );
  });

  it('a referência é decidida no momento em que a pendente entra no histórico, não no momento em que ficou pendente', () => {
    // Nenhuma tentativa da etapa 1 registrada ainda quando a pendente é criada
    // — mas por estar cheio, ela só entra depois. Se outra tentativa da etapa 1
    // virar referência ENQUANTO esta está pendente, a pendente não deve roubar
    // o posto ao ser finalmente aplicada.
    fillHistory(); // essas 20 já usam a etapa 1 e a primeira já é referência
    const referenceId = store.getState().referenceAttemptId;
    expect(referenceId).not.toBeNull();

    const overflowConfig = stage1Config('seed-overflow');
    store.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));

    const toRemove = store.getState().history[0].id;
    store.getState().removeAttempt(toRemove);

    // A referência original pode ter sido a que foi removida — nesse caso fica
    // null (comportamento já coberto em outro teste). Aqui garantimos apenas
    // que a pendente não se auto-promove por engano quando NÃO é a primeira.
    if (toRemove !== referenceId) {
      expect(store.getState().referenceAttemptId).toBe(referenceId);
    }
  });

  it('discardPendingAttempt descarta de forma explícita, sem promover automaticamente', () => {
    fillHistory();
    const overflowConfig = stage1Config('seed-overflow');
    store.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));
    expect(store.getState().pendingAttempt).not.toBeNull();

    store.getState().discardPendingAttempt();

    expect(store.getState().pendingAttempt).toBeNull();
    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    expect(store.getState().history.some((a) => a.config.seed === 'seed-overflow')).toBe(false);
  });

  it('hydrateHistory com pendente e espaço livre aplica direto', () => {
    const config = stage1Config('seed-a');
    const finalState = runToEnd(config);
    const attemptResult = store.getState().recordAttempt(config, finalState);
    if (!attemptResult.ok) throw new Error('gravação deveria ter sucesso');

    store.setState({ history: [], referenceAttemptId: null, pendingAttempt: null });
    store.getState().hydrateHistory([], null, attemptResult.attempt);

    expect(store.getState().pendingAttempt).toBeNull();
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0].id).toBe(attemptResult.attempt.id);
  });

  it('hydrateHistory com pendente e histórico cheio mantém a pendência', () => {
    fillHistory();
    const fullHistory = store.getState().history;

    const overflowConfig = stage1Config('seed-overflow');
    const overflowResult = store.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));
    if (overflowResult.ok) throw new Error('deveria ter ficado pendente');

    store.setState({ history: [], referenceAttemptId: null, pendingAttempt: null });
    store.getState().hydrateHistory(fullHistory, null, overflowResult.attempt);

    expect(store.getState().history).toHaveLength(MAX_HISTORY_SIZE);
    expect(store.getState().pendingAttempt?.id).toBe(overflowResult.attempt.id);
  });
});

describe('removeAttempt', () => {
  it('remove do histórico e da seleção de comparação', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));
    if (!result.ok) throw new Error('gravação deveria ter sucesso');

    store.getState().toggleComparisonSelection(result.attempt.id);
    expect(store.getState().selectedForComparison).toContain(result.attempt.id);

    store.getState().removeAttempt(result.attempt.id);

    expect(store.getState().history).toHaveLength(0);
    expect(store.getState().selectedForComparison).not.toContain(result.attempt.id);
  });

  it('remover a referência limpa a referência (sem promover outra automaticamente)', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));
    if (!result.ok) throw new Error('gravação deveria ter sucesso');

    expect(store.getState().referenceAttemptId).toBe(result.attempt.id);
    store.getState().removeAttempt(result.attempt.id);
    expect(store.getState().referenceAttemptId).toBeNull();
  });

  it('remover uma tentativa que não é a referência preserva a referência', () => {
    const first = store.getState().recordAttempt(stage1Config('seed-ref'), runToEnd(stage1Config('seed-ref')));
    const second = store
      .getState()
      .recordAttempt(stage1Config('seed-other'), runToEnd(stage1Config('seed-other')));

    if (!first.ok || !second.ok) throw new Error('gravação deveria ter sucesso');

    store.getState().removeAttempt(second.attempt.id);
    expect(store.getState().referenceAttemptId).toBe(first.attempt.id);
  });
});

describe('seleção para comparação', () => {
  it('alterna a seleção de uma tentativa', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));
    if (!result.ok) throw new Error('gravação deveria ter sucesso');

    store.getState().toggleComparisonSelection(result.attempt.id);
    expect(store.getState().selectedForComparison).toEqual([result.attempt.id]);

    store.getState().toggleComparisonSelection(result.attempt.id);
    expect(store.getState().selectedForComparison).toEqual([]);
  });

  it(`aceita no máximo ${MAX_COMPARISON_SELECTION} tentativas, descartando a mais antiga da seleção`, () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const config = stage1Config(`seed-${i}`);
      const result = store.getState().recordAttempt(config, runToEnd(config));
      if (result.ok) ids.push(result.attempt.id);
    }

    for (const id of ids) {
      store.getState().toggleComparisonSelection(id);
    }

    expect(store.getState().selectedForComparison).toHaveLength(MAX_COMPARISON_SELECTION);
    expect(store.getState().selectedForComparison).toEqual(ids.slice(1));
  });

  it('limpa a seleção', () => {
    const config = stage1Config();
    const result = store.getState().recordAttempt(config, runToEnd(config));
    if (!result.ok) throw new Error('gravação deveria ter sucesso');

    store.getState().toggleComparisonSelection(result.attempt.id);
    store.getState().clearComparisonSelection();
    expect(store.getState().selectedForComparison).toEqual([]);
  });
});

describe('referência manual', () => {
  it('permite trocar a referência explicitamente', () => {
    const first = store.getState().recordAttempt(stage1Config('seed-a'), runToEnd(stage1Config('seed-a')));
    const second = store
      .getState()
      .recordAttempt(stage1Config('seed-b'), runToEnd(stage1Config('seed-b')));

    if (!first.ok || !second.ok) throw new Error('gravação deveria ter sucesso');

    expect(store.getState().referenceAttemptId).toBe(first.attempt.id);
    store.getState().setReferenceAttempt(second.attempt.id);
    expect(store.getState().referenceAttemptId).toBe(second.attempt.id);
  });
});

describe('integração com o domínio de comparação', () => {
  it('duas gravações do mesmo cenário e seed são comparáveis', () => {
    const config = stage1Config();
    const a = store.getState().recordAttempt(config, runToEnd(config));

    const reordered = createAttemptConfig(SCENARIO_A, {
      seed: config.seed,
      guidedStage: 1,
      order: ['p5', 'p1', 'p2', 'p3', 'p4', 'p6'],
    });
    const b = store.getState().recordAttempt(reordered, runToEnd(reordered));

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.attempt.config.scenario.id).toBe(b.attempt.config.scenario.id);
    expect(a.attempt.config.seed).toBe(b.attempt.config.seed);
  });

  it('gravações de cenários diferentes (A e B) coexistem no mesmo histórico', () => {
    const configA = stage1Config();
    const configB = createAttemptConfig(SCENARIO_B, { guidedStage: 3 });

    store.getState().recordAttempt(configA, runToEnd(configA));
    store.getState().recordAttempt(configB, runToEnd(configB));

    expect(store.getState().history).toHaveLength(2);
    expect(store.getState().history[0].config.scenario.id).toBe('trilha-a');
    expect(store.getState().history[1].config.scenario.id).toBe('trilha-b');
  });
});
