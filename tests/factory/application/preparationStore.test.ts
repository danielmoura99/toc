import { beforeEach, describe, expect, it } from 'vitest';

import { usePreparationStore } from '@/features/factory/application/preparationStore';
import { createProductionLineConfig } from '@/features/factory/domain/config';

const store = usePreparationStore;

beforeEach(() => {
  store.setState({ draft: createProductionLineConfig({ seed: 'fixed-seed' }), prediction: null });
});

describe('setStageCount', () => {
  it('muda a contagem de setores preservando a seed', () => {
    store.getState().setStageCount(8);
    expect(store.getState().draft.stages).toHaveLength(8);
    expect(store.getState().draft.seed).toBe('fixed-seed');
  });

  it('preserva nomes de participantes nas posições que continuam existindo', () => {
    store.getState().setParticipantName('stage-0', 'Ana');
    store.getState().setParticipantName('stage-4', 'Beto');
    store.getState().setStageCount(4);
    expect(store.getState().draft.stages[0].participantName).toBe('Ana');
    // stage-4 não existe mais em 4 setores — não deve reaparecer em nenhuma posição.
    expect(store.getState().draft.stages.every((s) => s.participantName !== 'Beto')).toBe(true);
  });
});

describe('setRounds', () => {
  it('muda o horizonte preservando a seed e os participantes', () => {
    store.getState().setParticipantName('stage-0', 'Ana');
    store.getState().setRounds(20);
    expect(store.getState().draft.rounds).toBe(20);
    expect(store.getState().draft.seed).toBe('fixed-seed');
    expect(store.getState().draft.stages[0].participantName).toBe('Ana');
  });
});

describe('setHypothesis', () => {
  it('trunca em 500 caracteres', () => {
    store.getState().setHypothesis('a'.repeat(600));
    expect(store.getState().draft.hypothesis).toHaveLength(500);
  });
});

describe('setPrediction', () => {
  it('registra e permite limpar a previsão', () => {
    store.getState().setPrediction(35);
    expect(store.getState().prediction).toBe(35);
    store.getState().setPrediction(null);
    expect(store.getState().prediction).toBeNull();
  });
});

describe('rerollSeed', () => {
  it('gera uma seed nova preservando participantes, posições e horizonte', () => {
    store.getState().setParticipantName('stage-0', 'Ana');
    store.getState().setRounds(20);
    const before = store.getState().draft;

    store.getState().rerollSeed();
    const after = store.getState().draft;

    expect(after.seed).not.toBe(before.seed);
    expect(after.rounds).toBe(before.rounds);
    expect(after.stages).toHaveLength(before.stages.length);
    expect(after.stages[0].participantName).toBe('Ana');
  });
});

describe('newRunConfig', () => {
  it('cada partida iniciada recebe uma seed nova — dados diferentes a cada partida', () => {
    store.getState().setParticipantName('stage-0', 'Ana');
    store.getState().setRounds(20);

    const first = store.getState().newRunConfig();
    const second = store.getState().newRunConfig();

    expect(first.seed).not.toBe('fixed-seed');
    expect(second.seed).not.toBe(first.seed);
    expect(second.rounds).toBe(20);
    expect(second.stages[0].participantName).toBe('Ana');
  });

  it('seeds novas produzem sequências de dados diferentes (não só rótulos diferentes)', async () => {
    const { runToEnd } = await import('@/features/factory/domain/engine');
    const results = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const final = runToEnd(store.getState().newRunConfig());
      results.add(final.events.map((event) => event.die).join(''));
    }
    expect(results.size).toBe(5);
  });
});

describe('resetDraft', () => {
  it('volta a um rascunho novo, com seed diferente, e limpa a previsão', () => {
    store.getState().setPrediction(20);
    const before = store.getState().draft;
    store.getState().resetDraft();
    expect(store.getState().draft.seed).not.toBe(before.seed);
    expect(store.getState().prediction).toBeNull();
  });
});

describe('restoreDraft', () => {
  it('aplica um snapshot recuperado', () => {
    const config = createProductionLineConfig({ stageCount: 6, rounds: 30, seed: 'restored' });
    store.getState().restoreDraft({ config, prediction: 42 });
    expect(store.getState().draft).toEqual(config);
    expect(store.getState().prediction).toBe(42);
  });
});

describe('setExperience (evolução Restrição e fluxo)', () => {
  it('troca para "Restrição e fluxo" com perfis da linha de base, 20 dias e participantes preservados', () => {
    store.getState().setParticipantName('stage-0', 'Ana');
    store.getState().setExperience('constraint-flow');
    const draft = store.getState().draft;
    expect(draft.experience).toBe('constraint-flow');
    expect(draft.rounds).toBe(20);
    expect(draft.capacityProfiles.map((p) => p.baseBonus)).toEqual([2, 2, 0, 2, 2]);
    expect(draft.stages[0].participantName).toBe('Ana');
  });

  it('volta para a experiência antiga sem bônus e com 10 dias', () => {
    store.getState().setExperience('constraint-flow');
    store.getState().setExperience('dependency-variability');
    const draft = store.getState().draft;
    expect(draft.capacityProfiles.every((p) => p.baseBonus === 0)).toBe(true);
    expect(draft.rounds).toBe(10);
    expect(draft.experimentId).toBeNull();
  });

  it('cada partida nova da experiência nova é um experimento novo', () => {
    store.getState().setExperience('constraint-flow');
    const first = store.getState().newRunConfig();
    const second = store.getState().newRunConfig();
    expect(first.experimentId).not.toBe(second.experimentId);
    expect(first.experience).toBe('constraint-flow');
  });
});
