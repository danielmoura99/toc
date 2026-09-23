import { beforeEach, describe, expect, it } from 'vitest';

import { useAttemptsStore } from '@/features/trail/application/attemptsStore';
import { usePreparationStore } from '@/features/trail/application/preparationStore';
import { GUIDED_STAGES, HYPOTHESIS_MAX_LENGTH, getStage } from '@/features/trail/application/stages';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { computeLoadByCharacter } from '@/features/trail/domain/engine';
import { finalizeResult } from '@/features/trail/domain/metrics';
import { validateConfig, conservesItems } from '@/features/trail/domain/validation';
import { itemsOwnedBy } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import type { AttemptResult, Scenario } from '@/features/trail/domain/types';
import { SCENARIO_A, SCENARIO_B } from '@/features/trail/scenarios';

const store = usePreparationStore;

/**
 * Etapas 2 e 3 exigem uma conclusão da etapa 1 desta expedição no histórico
 * (ajuste de navegação, 22/09/2026). Semeia essa conclusão, pelo motor de
 * verdade, para os testes que exercitam comportamento das etapas 2/3 sem que
 * a própria conclusão seja o que está sob teste.
 */
function unlockStages23(scenario: Scenario): void {
  const config = createAttemptConfig(scenario, { guidedStage: 1 });
  const finalState = runToEnd(config);
  const metrics = finalizeResult(config, finalState);
  const attempt: AttemptResult = {
    id: `seed-etapa1-${scenario.id}`,
    createdAt: new Date().toISOString(),
    config,
    outcome: metrics.outcome,
    finalState,
    totalTimeSec: metrics.totalTimeSec,
    meanSpreadM: metrics.meanSpreadM,
    metrics,
  };
  useAttemptsStore.getState().hydrateHistory([attempt], attempt.id);
}

// A maior parte destes testes exercita o comportamento GENÉRICO da store
// (ordenar, redistribuir, restaurar) sobre o cenário A, que continua servindo
// de referência de teste estável (elenco fixo p1..p6) — não porque a
// aplicação ainda entra direto nele. A etapa 2 é o ponto de partida porque já
// libera reordenar; a etapa 1 (sempre travada) tem sua própria seção.
beforeEach(() => {
  store.getState().startExpedition(SCENARIO_A);
  unlockStages23(SCENARIO_A);
  store.getState().setStage(2);
});

describe('etapas guiadas', () => {
  it('define três etapas', () => {
    expect(GUIDED_STAGES).toEqual([1, 2, 3]);
  });

  it('a etapa 1 é totalmente travada — nem ordem nem carga', () => {
    expect(getStage(1).canReorder).toBe(false);
    expect(getStage(1).canRedistribute).toBe(false);
  });

  it('a etapa 2 libera a ordem, mas não a carga', () => {
    expect(getStage(2).canReorder).toBe(true);
    expect(getStage(2).canRedistribute).toBe(false);
  });

  it('a etapa 3 libera ordem e carga', () => {
    expect(getStage(3).canReorder).toBe(true);
    expect(getStage(3).canRedistribute).toBe(true);
  });

  it('cada etapa declara o que muda, o que é preservado e a pergunta', () => {
    for (const stage of GUIDED_STAGES) {
      const definition = getStage(stage);
      expect(definition.allowedDecisions.length).toBeGreaterThan(0);
      expect(definition.preservedConditions.length).toBeGreaterThan(0);
      expect(definition.mainQuestion).toMatch(/\?$/);
    }
  });

  it('a etapa não conhece mais um cenário fixo — funciona igual para qualquer expedição', () => {
    store.getState().startExpedition(SCENARIO_B);
    store.getState().setStage(1);
    expect(store.getState().draft.scenario.id).toBe('trilha-b');
    expect(getStage(1).canReorder).toBe(false);
  });
});

describe('startExpedition', () => {
  it('define a expedição, volta para a etapa 1 e trava ordem e carga', () => {
    store.getState().startExpedition(SCENARIO_A, { p1: 'Ana' });

    const state = store.getState();
    expect(state.expedition.id).toBe('trilha-a');
    expect(state.stage).toBe(1);
    expect(state.draft.order).toEqual(SCENARIO_A.initialOrder);
    expect(computeLoadByCharacter(state.draft)).toEqual(computeLoadByCharacter(
      { ...state.draft, ownerByItem: SCENARIO_A.initialOwnerByItem },
    ));
    expect(state.draft.participantByCharacter.p1).toBe('Ana');
  });

  it('a configuração inicial é sempre válida', () => {
    store.getState().startExpedition(SCENARIO_A);
    expect(validateConfig(store.getState().draft).valid).toBe(true);
  });

  it('trocar de expedição substitui a anterior, não acumula', () => {
    store.getState().startExpedition(SCENARIO_A);
    store.getState().startExpedition(SCENARIO_B);

    expect(store.getState().expedition.id).toBe('trilha-b');
    expect(store.getState().draft.scenario.id).toBe('trilha-b');
  });
});

describe('store — travamento da etapa 1', () => {
  beforeEach(() => {
    store.getState().startExpedition(SCENARIO_A);
    store.getState().setStage(1);
  });

  it('moveCharacter não reordena', () => {
    const before = [...store.getState().draft.order];
    store.getState().moveCharacter(before[2], -1);
    expect(store.getState().draft.order).toEqual(before);
  });

  it('setOrder não reordena', () => {
    const before = [...store.getState().draft.order];
    store.getState().setOrder([...before].reverse());
    expect(store.getState().draft.order).toEqual(before);
  });

  it('moveItems não redistribui', () => {
    const before = computeLoadByCharacter(store.getState().draft);
    const moving = itemsOwnedBy(store.getState().draft, 'p5');
    store.getState().moveItems(moving, 'p1');
    expect(computeLoadByCharacter(store.getState().draft)).toEqual(before);
  });

  it('reiniciar a tentativa na etapa 1 não libera nada e não gera outra configuração', () => {
    const before = store.getState().draft;
    store.getState().resetDraft();
    const after = store.getState().draft;

    expect(after.order).toEqual(before.order);
    expect(after.ownerByItem).toEqual(before.ownerByItem);
    expect(after.scenario.id).toBe(before.scenario.id);
    expect(after.scenario.defaultSeed).toBe(before.scenario.defaultSeed);
  });
});

describe('store — etapas 2 e 3 exigem ter concluído a etapa 1 desta expedição', () => {
  // Este bloco parte de uma expedição SEM nenhuma conclusão no histórico —
  // diferente do `beforeEach` global do arquivo, que já semeia uma. Cada
  // teste decide por si quando (e se) semear.
  beforeEach(() => {
    useAttemptsStore.setState({ history: [], referenceAttemptId: null, selectedForComparison: [], pendingAttempt: null });
    store.getState().startExpedition(SCENARIO_A);
  });

  it('setStage(2) não faz nada sem nenhuma conclusão da etapa 1', () => {
    store.getState().setStage(2);
    expect(store.getState().stage).toBe(1);
  });

  it('setStage(3) não faz nada sem nenhuma conclusão da etapa 1', () => {
    store.getState().setStage(3);
    expect(store.getState().stage).toBe(1);
  });

  it('setStage(2) funciona depois de concluir a etapa 1 desta expedição', () => {
    unlockStages23(SCENARIO_A);
    store.getState().setStage(2);
    expect(store.getState().stage).toBe(2);
  });

  it('uma conclusão de OUTRA expedição não libera esta', () => {
    unlockStages23(SCENARIO_B);
    store.getState().setStage(2);
    expect(store.getState().stage).toBe(1);
  });

  it('uma conclusão de outra etapa (não a 1) desta expedição não libera', () => {
    const config = createAttemptConfig(SCENARIO_A, { guidedStage: 2 });
    const finalState = runToEnd(config);
    const metrics = finalizeResult(config, finalState);
    useAttemptsStore.getState().hydrateHistory(
      [{ id: 'x', createdAt: new Date().toISOString(), config, outcome: metrics.outcome, finalState, totalTimeSec: metrics.totalTimeSec, meanSpreadM: metrics.meanSpreadM, metrics }],
      null,
    );

    store.getState().setStage(2);
    expect(store.getState().stage).toBe(1);
  });

  it('gerar uma nova expedição re-trava as etapas 2 e 3, mesmo com uma conclusão anterior no histórico', () => {
    unlockStages23(SCENARIO_A);
    store.getState().setStage(2);
    expect(store.getState().stage).toBe(2);

    store.getState().startExpedition(SCENARIO_B);
    expect(store.getState().stage).toBe(1);

    store.getState().setStage(2);
    expect(store.getState().stage).toBe(1); // trilha-b não tem conclusão própria
  });
});

describe('store — troca de etapa', () => {
  it('avança para a etapa seguinte preservando a expedição', () => {
    store.getState().setStage(3);
    const draft = store.getState().draft;

    expect(draft.guidedStage).toBe(3);
    expect(draft.scenario.id).toBe('trilha-a');
  });

  it('a configuração inicial de cada etapa é válida', () => {
    for (const stage of GUIDED_STAGES) {
      store.getState().setStage(stage);
      expect(validateConfig(store.getState().draft).valid).toBe(true);
    }
  });

  it('trocar de etapa descarta as edições de ordem e carga', () => {
    store.getState().moveCharacter('p5', -1);
    const reordered = [...store.getState().draft.order];

    store.getState().setStage(3);
    expect(store.getState().draft.order).not.toEqual(reordered);
    expect(store.getState().draft.order).toEqual(store.getState().draft.scenario.initialOrder);
  });

  it('trocar de etapa preserva quem representa cada personagem', () => {
    store.getState().setParticipant('p1', 'Ana');
    store.getState().setParticipant('p5', 'Bruno');

    store.getState().setStage(3);

    expect(store.getState().draft.participantByCharacter.p1).toBe('Ana');
    expect(store.getState().draft.participantByCharacter.p5).toBe('Bruno');
  });
});

describe('store — ordenação', () => {
  it('move um personagem para frente', () => {
    const before = [...store.getState().draft.order];
    const target = before[2];

    store.getState().moveCharacter(target, -1);
    const after = store.getState().draft.order;

    expect(after[1]).toBe(target);
    expect(after[2]).toBe(before[1]);
  });

  it('move um personagem para trás', () => {
    const before = [...store.getState().draft.order];
    const target = before[0];

    store.getState().moveCharacter(target, 1);
    expect(store.getState().draft.order[1]).toBe(target);
  });

  it('não move além das bordas da fila', () => {
    const before = [...store.getState().draft.order];

    store.getState().moveCharacter(before[0], -1);
    expect(store.getState().draft.order).toEqual(before);

    store.getState().moveCharacter(before[before.length - 1], 1);
    expect(store.getState().draft.order).toEqual(before);
  });

  it('reordenar preserva o elenco completo (R01)', () => {
    store.getState().setOrder(['p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
    const draft = store.getState().draft;

    expect(new Set(draft.order).size).toBe(6);
    expect(validateConfig(draft).valid).toBe(true);
  });

  it('reordenar não muda as cargas', () => {
    const before = computeLoadByCharacter(store.getState().draft);
    store.getState().setOrder(['p5', 'p1', 'p2', 'p3', 'p4', 'p6']);

    expect(computeLoadByCharacter(store.getState().draft)).toEqual(before);
  });
});

describe('store — mochilas', () => {
  beforeEach(() => {
    store.getState().setStage(3);
  });

  it('transferir conserva itens e peso total (R07)', () => {
    const before = store.getState().draft;
    const moving = itemsOwnedBy(before, 'p5').slice(0, 6);

    store.getState().moveItems(moving, 'p3');
    const after = store.getState().draft;

    expect(conservesItems(before, after)).toBe(true);
    expect(computeLoadByCharacter(after).p5).toBe(12);
    expect(computeLoadByCharacter(after).p3).toBe(12);

    const total = Object.values(computeLoadByCharacter(after)).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(48);
  });

  it('AC03 — sobrecarregar bloqueia o início', () => {
    // p5 já está no teto de 18 kg; mais 1 kg o ultrapassa.
    const extra = itemsOwnedBy(store.getState().draft, 'p1').slice(0, 1);
    store.getState().moveItems(extra, 'p5');

    const validation = validateConfig(store.getState().draft);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('overloaded');
  });

  it('transferir lista vazia não altera nada', () => {
    const before = store.getState().draft;
    store.getState().moveItems([], 'p1');
    expect(store.getState().draft).toBe(before);
  });

  it('esvaziar uma mochila é permitido', () => {
    const all = itemsOwnedBy(store.getState().draft, 'p5');
    store.getState().moveItems(all, 'p3');

    expect(computeLoadByCharacter(store.getState().draft).p5).toBe(0);
    expect(validateConfig(store.getState().draft).valid).toBe(true);
  });
});

describe('store — permissão de etapa reforçada na própria store', () => {
  it('moveItems não transfere nada nas etapas 1 e 2, mesmo chamada diretamente', () => {
    for (const stage of [1, 2] as const) {
      store.getState().setStage(stage);
      const before = computeLoadByCharacter(store.getState().draft);

      const moving = itemsOwnedBy(store.getState().draft, 'p5').slice(0, 6);
      store.getState().moveItems(moving, 'p3');

      expect(computeLoadByCharacter(store.getState().draft)).toEqual(before);
    }
  });

  it('moveItems funciona normalmente na etapa 3', () => {
    store.getState().setStage(3);
    const before = computeLoadByCharacter(store.getState().draft);

    const moving = itemsOwnedBy(store.getState().draft, 'p5').slice(0, 3);
    store.getState().moveItems(moving, 'p3');

    const after = computeLoadByCharacter(store.getState().draft);
    expect(after.p5).toBe(before.p5 - 3);
  });

  it('a store nunca permite redistribuir fora da UI: chamar moveItems direto na etapa 1 não muda nada', () => {
    // Regressão do achado: antes, só o `disabled` do BackpackEditor impedia
    // isso — chamar a ação da store diretamente contornava a regra.
    store.getState().setStage(1);
    const draftBefore = store.getState().draft;

    store.getState().moveItems(itemsOwnedBy(draftBefore, 'p5'), 'p1');

    expect(store.getState().draft.ownerByItem).toEqual(draftBefore.ownerByItem);
  });
});

describe('store — participantes e hipótese', () => {
  it('associa e remove o nome do participante', () => {
    store.getState().setParticipant('p1', 'Ana');
    expect(store.getState().draft.participantByCharacter.p1).toBe('Ana');

    store.getState().setParticipant('p1', '   ');
    expect(store.getState().draft.participantByCharacter.p1).toBeUndefined();
  });

  it('o nome do participante não influencia o resultado', () => {
    const semNome = runToEnd(store.getState().draft);

    store.getState().setParticipant('p1', 'Ana');
    store.getState().setParticipant('p5', 'Bruno');

    expect(runToEnd(store.getState().draft).characters).toEqual(semNome.characters);
  });

  it('limita a hipótese a 500 caracteres', () => {
    store.getState().setHypothesis('x'.repeat(600));
    expect(store.getState().draft.hypothesis).toHaveLength(HYPOTHESIS_MAX_LENGTH);
  });

  it('a hipótese não influencia o resultado', () => {
    const semHipotese = runToEnd(store.getState().draft);
    store.getState().setHypothesis('Aliviar quem está sobrecarregado deve ajudar.');

    expect(runToEnd(store.getState().draft).characters).toEqual(semHipotese.characters);
  });
});

describe('store — restaurar', () => {
  it('volta à configuração inicial da etapa corrente, preservando participantes', () => {
    store.getState().setStage(3);
    store.getState().setParticipant('p1', 'Ana');
    const initialOrder = [...store.getState().draft.order];

    store.getState().setOrder(['p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
    store.getState().moveItems(itemsOwnedBy(store.getState().draft, 'p5').slice(0, 5), 'p1');
    store.getState().setHypothesis('teste');

    store.getState().resetDraft();
    const draft = store.getState().draft;

    expect(draft.order).toEqual(initialOrder);
    expect(computeLoadByCharacter(draft).p5).toBe(18);
    expect(draft.hypothesis).toBe('');
    expect(draft.guidedStage).toBe(3);
    expect(draft.participantByCharacter.p1).toBe('Ana');
  });
});

describe('a configuração preparada chega ao motor', () => {
  it('uma configuração válida executa até o fim', () => {
    store.getState().setStage(3);
    store.getState().setOrder(['p5', 'p1', 'p2', 'p3', 'p4', 'p6']);
    store.getState().moveItems(itemsOwnedBy(store.getState().draft, 'p5').slice(0, 9), 'p3');

    const draft = store.getState().draft;
    expect(validateConfig(draft).valid).toBe(true);

    const state = runToEnd(draft);
    expect(state.status).toBe('completed');
    expect(state.elapsedSec).toBeGreaterThan(0);
  });

  it('aliviar a restrição reduz o tempo do grupo', () => {
    store.getState().setStage(3);
    const semAlivio = runToEnd(store.getState().draft).elapsedSec;

    store.getState().moveItems(itemsOwnedBy(store.getState().draft, 'p5').slice(0, 9), 'p3');
    const comAlivio = runToEnd(store.getState().draft).elapsedSec;

    expect(comAlivio).toBeLessThan(semAlivio);
  });

  it('o snapshot iniciado não muda quando a preparação é editada', () => {
    store.getState().setStage(3);
    const snapshot = structuredClone(store.getState().draft);
    const baseline = runToEnd(snapshot);

    store.getState().setOrder(['p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
    store.getState().moveItems(itemsOwnedBy(store.getState().draft, 'p5').slice(0, 10), 'p1');

    expect(runToEnd(snapshot)).toEqual(baseline);
  });
});
