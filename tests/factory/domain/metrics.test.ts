import { describe, expect, it } from 'vitest';

import { runToEnd } from '@/features/factory/domain/engine';
import { createProductionLineConfig, stageId } from '@/features/factory/domain/config';
import { classifyRunRelationship, compareRuns, summarize } from '@/features/factory/domain/metrics';

describe('summarize', () => {
  it('agrega só depois de rodadas completas, e a referência é 3,5 × rodadas', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'metrics-1' });
    const state = runToEnd(config);
    const summary = summarize(config, state);

    expect(summary.completedRounds).toBe(10);
    expect(summary.roundAggregates).toHaveLength(10);
    expect(summary.referenceAccumulated).toBe(35);
    expect(summary.deviationDelivered).toBe(summary.delivered - 35);
    expect(summary.meanOutputPerRound).toBeCloseTo(summary.delivered / 10);

    // Conservação também no resumo: entrega + estoque = entrada.
    const lastEvent = state.events[state.events.length - 1];
    expect(summary.delivered + summary.inventoryRemaining).toBe(lastEvent.introducedTotal);
  });

  it('meanOutputPerRound é nulo antes da primeira rodada concluída', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'metrics-2' });
    const zeroTurnsSummary = summarize(config, {
      nextRoundIndex: 0,
      nextStageIndex: 0,
      completedRounds: 0,
      inventoryByStage: Object.fromEntries(config.stages.map((s) => [s.id, 0])),
      introduced: 0,
      delivered: 0,
      events: [],
      status: 'active',
    });
    expect(zeroTurnsSummary.meanOutputPerRound).toBeNull();
    expect(zeroTurnsSummary.roundAggregates).toHaveLength(0);
  });

  it('desvio acumulado por etapa pode ser negativo (inclui valores abaixo da referência)', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'metrics-3' });
    const state = runToEnd(config);
    const summary = summarize(config, state);
    const values = Object.values(summary.deviationByStageFinal);
    // Não afirmamos que TODA execução tem desvio negativo — só que o campo
    // aceita valores negativos quando eles ocorrem (checagem estrutural).
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(Object.keys(summary.deviationByStageFinal)).toEqual(config.stages.map((s) => s.id));
  });

  it('lotes expedidos por dia bate com a transferência da última etapa naquela rodada', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'metrics-4' });
    const state = runToEnd(config);
    const summary = summarize(config, state);
    const lastStageId = config.stages[config.stages.length - 1].id;

    for (const round of summary.roundAggregates) {
      const eventsThisRound = state.events.filter(
        (e) => e.roundIndex === round.roundIndex && e.stageId === lastStageId,
      );
      expect(eventsThisRound).toHaveLength(1);
      expect(round.deliveredThisRound).toBe(eventsThisRound[0].transferred);
    }
  });
});

describe('classifyRunRelationship / compareRuns', () => {
  const base = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'seed-a' });

  it('mesma configuração e seed: reprodução', () => {
    expect(classifyRunRelationship(base, base)).toBe('reproduction');
  });

  it('mesma configuração, seed diferente: outra realização aleatória', () => {
    const other = { ...base, seed: 'seed-b' };
    expect(classifyRunRelationship(base, other)).toBe('same_conditions_new_seed');
  });

  it('quantidade de etapas diferente: condições diferentes', () => {
    const other = createProductionLineConfig({ stageCount: 6, rounds: 10, seed: 'seed-a' });
    expect(classifyRunRelationship(base, other)).toBe('different_conditions');
  });

  it('horizonte diferente: condições diferentes', () => {
    const other = createProductionLineConfig({ stageCount: 5, rounds: 20, seed: 'seed-a' });
    expect(classifyRunRelationship(base, other)).toBe('different_conditions');
  });

  it('nomes de participantes não afetam a classificação (TG09)', () => {
    const renamed = {
      ...base,
      stages: base.stages.map((s, i) => ({ ...s, participantName: `Pessoa ${i}`, sectorName: `Custom ${i}` })),
    };
    expect(classifyRunRelationship(base, renamed)).toBe('reproduction');
  });

  it('compareRuns não calcula percentual de melhoria — só deltas brutos', () => {
    const stateA = runToEnd(base);
    const otherConfig = { ...base, seed: 'seed-b' };
    const stateB = runToEnd(otherConfig);

    const comparison = compareRuns(
      { config: base, summary: summarize(base, stateA) },
      { config: otherConfig, summary: summarize(otherConfig, stateB) },
    );

    expect(comparison.relationship).toBe('same_conditions_new_seed');
    expect(comparison).not.toHaveProperty('improvementPct');
    expect(comparison.deliveredDeltaAbs).toBe(stateB.delivered - stateA.delivered);
  });
});

describe('stageId', () => {
  it('é posicional e estável', () => {
    expect(stageId(0)).toBe('stage-0');
    expect(stageId(11)).toBe('stage-11');
  });
});
