import { describe, expect, it } from 'vitest';

import { baselineConfigOf, buildInterventionConfig, createProductionLineConfig, stageId } from '@/features/factory/domain/config';
import { constraintIndex, diagnoseConstraint, nominalMeanCapacity } from '@/features/factory/domain/capacity';
import { createInitialState, inventoryInProcess, runToEnd, stepTurn, type RollFace } from '@/features/factory/domain/engine';
import { classifyRunRelationship, sameDiceSequence, summarize } from '@/features/factory/domain/metrics';
import { validateConfig } from '@/features/factory/domain/validation';
import type { AddedCapacity, ProductionLineConfig } from '@/features/factory/domain/types';

function constraintConfig(overrides: { stageCount?: number; rounds?: 10 | 20 | 30; seed?: string } = {}): ProductionLineConfig {
  return createProductionLineConfig({
    experience: 'constraint-flow',
    stageCount: overrides.stageCount ?? 5,
    rounds: overrides.rounds ?? 20,
    seed: overrides.seed ?? 'cf-seed',
  });
}

function fixedFaces(faces: number[]): RollFace {
  return (id) => faces[Number(id.replace('stage-', ''))];
}

function oneDay(config: ProductionLineConfig, faces: number[]) {
  let state = createInitialState(config);
  for (let i = 0; i < config.stages.length; i += 1) state = stepTurn(config, state, fixedFaces(faces));
  return state;
}

const queues = (config: ProductionLineConfig, state: ReturnType<typeof oneDay>) =>
  config.stages.map((stage) => state.inventoryByStage[stage.id]);

describe('perfis de capacidade (§4)', () => {
  it('restrição original no setor central; bônus 0 nele e 2 nos demais', () => {
    const config = constraintConfig();
    expect(config.originalConstraintStageId).toBe(stageId(2));
    expect(config.capacityProfiles.map((p) => p.baseBonus)).toEqual([2, 2, 0, 2, 2]);
    expect(config.capacityProfiles.every((p) => p.upgrade === 0)).toBe(true);
    expect(config.rounds).toBe(20);
  });

  it('restrição central para 4 e 12 setores: floor(n / 2)', () => {
    expect(constraintIndex(4)).toBe(2);
    expect(constraintIndex(12)).toBe(6);
    expect(constraintConfig({ stageCount: 12 }).originalConstraintStageId).toBe(stageId(6));
  });

  it('experiência antiga continua com capacidade = dado, sem bônus', () => {
    const legacy = createProductionLineConfig({ seed: 'legacy' });
    expect(legacy.experience).toBe('dependency-variability');
    expect(legacy.capacityProfiles.every((p) => p.baseBonus === 0 && p.upgrade === 0)).toBe(true);
    const state = runToEnd(legacy);
    expect(state.events.every((e) => e.availableCapacity === e.die)).toBe(true);
  });
});

describe('Exemplo A — primeiro dia (§10)', () => {
  it('a restrição teve capacidade 6 mas processou 3 por falta de material', () => {
    const config = constraintConfig();
    const state = oneDay(config, [1, 1, 6, 1, 1]);
    expect(state.events.map((e) => e.availableCapacity)).toEqual([3, 3, 6, 3, 3]);
    expect(state.events.map((e) => e.transferred)).toEqual([3, 3, 3, 3, 3]);
    expect(state.events.map((e) => e.unusedCapacity)).toEqual([0, 0, 3, 0, 0]);
    expect(queues(config, state)).toEqual([0, 0, 0, 0, 0]);
    expect(state.introduced).toBe(3);
    expect(state.delivered).toBe(3);
    expect(inventoryInProcess(state)).toBe(0);
  });
});

describe('Exemplo B — mais entrada sem mais entrega imediata (§10)', () => {
  const faces = [6, 6, 1, 6, 6];

  it('linha de base: 8/8/1/8/8', () => {
    const config = constraintConfig();
    const state = oneDay(config, faces);
    expect(state.events.map((e) => e.availableCapacity)).toEqual([8, 8, 1, 8, 8]);
    expect(state.events.map((e) => e.transferred)).toEqual([8, 8, 1, 1, 1]);
    expect(queues(config, state)).toEqual([0, 0, 7, 0, 0]);
    expect([state.introduced, state.delivered, inventoryInProcess(state)]).toEqual([8, 1, 7]);
  });

  it('+1 no primeiro setor: mais entrada e mais estoque, mesma entrega', () => {
    const config = buildInterventionConfig(constraintConfig(), 'base', stageId(0), 1, '');
    const state = oneDay(config, faces);
    expect(state.events.map((e) => e.availableCapacity)).toEqual([9, 8, 1, 8, 8]);
    expect(queues(config, state)).toEqual([0, 1, 7, 0, 0]);
    expect([state.introduced, state.delivered, inventoryInProcess(state)]).toEqual([9, 1, 8]);
  });

  it('+1 no terceiro setor: entrega 2, estoque 6', () => {
    const config = buildInterventionConfig(constraintConfig(), 'base', stageId(2), 1, '');
    const state = oneDay(config, faces);
    expect(state.events.map((e) => e.availableCapacity)).toEqual([8, 8, 2, 8, 8]);
    expect(queues(config, state)).toEqual([0, 0, 6, 0, 0]);
    expect([state.introduced, state.delivered, inventoryInProcess(state)]).toEqual([8, 2, 6]);
  });
});

describe('intervenções (§5)', () => {
  it('apenas o setor escolhido recebe o acréscimo; nada se acumula entre tentativas', () => {
    const base = constraintConfig();
    const first = buildInterventionConfig(base, 'run-base', stageId(0), 2, 'primeira');
    const second = buildInterventionConfig(first, 'run-base', stageId(3), 1, 'segunda');

    expect(second.capacityProfiles.map((p) => p.upgrade)).toEqual([0, 0, 0, 1, 0]);
    expect(second.capacityProfiles.map((p) => p.baseBonus)).toEqual([2, 2, 0, 2, 2]);
    expect(second.seed).toBe(base.seed);
    expect(second.rounds).toBe(base.rounds);
    expect(second.experimentId).toBe(base.experimentId);
    expect(second.intervention).toEqual({ baselineRunId: 'run-base', targetStageId: stageId(3), addedCapacity: 1, prediction: 'segunda' });
    expect(validateConfig(second).valid).toBe(true);
  });

  it('a base é recuperável da própria tentativa, mesmo sem o resultado dela', () => {
    const base = constraintConfig();
    const attempt = buildInterventionConfig(base, 'run-base', stageId(2), 3, '');
    expect(baselineConfigOf(attempt)).toEqual(base);
  });

  it('mesma seed: faces idênticas na base e em todas as intervenções; recomeço com filas vazias', () => {
    const base = constraintConfig({ seed: 'same-dice' });
    const baseState = runToEnd(base);
    for (const [target, added] of [[0, 1], [2, 1], [2, 2], [2, 3], [4, 1]] as Array<[number, AddedCapacity]>) {
      const attempt = buildInterventionConfig(base, 'b', stageId(target), added, '');
      const state = runToEnd(attempt);
      expect(state.events.map((e) => e.die)).toEqual(baseState.events.map((e) => e.die));
      expect(createInitialState(attempt).inventoryByStage).toEqual(createInitialState(base).inventoryByStage);
    }
  });

  it('com os mesmos dados, só aumentar capacidade nunca diminui a entrega final (propriedade de regressão §11)', () => {
    for (let s = 0; s < 40; s += 1) {
      const base = constraintConfig({ seed: `mono-${s}` });
      const delivered = runToEnd(base).delivered;
      for (let target = 0; target < 5; target += 1) {
        for (const added of [1, 2, 3] as AddedCapacity[]) {
          const attempt = buildInterventionConfig(base, 'b', stageId(target), added, '');
          expect(runToEnd(attempt).delivered).toBeGreaterThanOrEqual(delivered);
        }
      }
    }
  });

  it('conservação e transferido ≤ capacidade disponível em cada jogada', () => {
    const config = buildInterventionConfig(constraintConfig({ seed: 'conserv-cf' }), 'b', stageId(2), 2, '');
    let state = createInitialState(config);
    while (state.status === 'active') {
      state = stepTurn(config, state);
      const event = state.events.at(-1)!;
      expect(event.transferred).toBeLessThanOrEqual(event.availableCapacity);
      expect(event.unusedCapacity).toBe(event.availableCapacity - event.transferred);
      expect(event.availableCapacity).toBe(event.die + config.capacityProfiles[event.stageIndex].baseBonus + config.capacityProfiles[event.stageIndex].upgrade);
      expect(state.introduced).toBe(state.delivered + inventoryInProcess(state));
    }
  });
});

describe('diagnóstico estrutural (§6.2)', () => {
  const base = constraintConfig();
  const on = (added: AddedCapacity) => buildInterventionConfig(base, 'b', stageId(2), added, '');

  it('linha de base: restrição única no setor central, média 3,5 contra 5,5', () => {
    const d = diagnoseConstraint(base);
    expect(d.constrainedStageIds).toEqual([stageId(2)]);
    expect(d.minMean).toBe(3.5);
    expect(d.isTie).toBe(false);
    expect(d.originalIsUniqueConstraint).toBe(true);
    expect(nominalMeanCapacity(base, stageId(0))).toBe(5.5);
  });

  it('+1 na restrição: sobe a 4,5 e continua a única menor média', () => {
    const d = diagnoseConstraint(on(1));
    expect(d.minMean).toBe(4.5);
    expect(d.constrainedStageIds).toEqual([stageId(2)]);
  });

  it('+2 na restrição: todas empatam em 5,5 — empate, não nova restrição única', () => {
    const d = diagnoseConstraint(on(2));
    expect(d.minMean).toBe(5.5);
    expect(d.isTie).toBe(true);
    expect(d.constrainedStageIds).toHaveLength(5);
    expect(d.originalIsUniqueConstraint).toBe(false);
  });

  it('+3 na restrição: original vai a 6,5 e os outros quatro empatam na menor média', () => {
    const d = diagnoseConstraint(on(3));
    expect(d.meanByStage[stageId(2)]).toBe(6.5);
    expect(d.minMean).toBe(5.5);
    expect(d.constrainedStageIds).toEqual([stageId(0), stageId(1), stageId(3), stageId(4)]);
    expect(d.isTie).toBe(true);
  });
});

describe('métricas da nova experiência (§8)', () => {
  it('capacidade acumulada usa a total; falta de material exclui a fonte; aproveitamento = processado / capacidade', () => {
    const config = constraintConfig();
    const state = oneDay(config, [6, 6, 1, 6, 6]);
    const summary = summarize(config, state);
    expect(summary.capacitySampledByStage[stageId(0)]).toBe(8);
    expect(summary.insufficientMaterialTurnsByStage[stageId(0)]).toBe(0);
    // Inspeção e Expedição tinham 8 de capacidade, mas só 1 lote disponível.
    expect(summary.insufficientMaterialTurnsByStage[stageId(3)]).toBe(1);
    expect(summary.unusedCapacityByStage[stageId(3)]).toBe(7);
    expect(summary.utilizationByStage[stageId(3)]).toBeCloseTo(1 / 8);
    expect(summary.utilizationByStage[stageId(2)]).toBe(1);
  });

  it('referência pela menor média × dias encerrados; desvio de cada setor pela própria média', () => {
    const config = constraintConfig({ rounds: 10 });
    const state = runToEnd(config);
    const summary = summarize(config, state);
    expect(summary.referenceRatePerRound).toBe(3.5);
    expect(summary.referenceAccumulated).toBe(35);
    const turns = 10;
    expect(summary.deviationByStageFinal[stageId(0)]).toBeCloseTo(summary.transferredByStage[stageId(0)] - 5.5 * turns);
  });

  it('taxa de entrega usa só os dias encerrados — dia parcial não contamina', () => {
    const config = constraintConfig();
    let state = createInitialState(config);
    for (let i = 0; i < config.stages.length * 2 + 2; i += 1) state = stepTurn(config, state);
    const summary = summarize(config, state);
    expect(summary.completedRounds).toBe(2);
    expect(summary.meanOutputPerRound).toBe(summary.roundAggregates[1].deliveredCumulative / 2);
    expect(summary.roundAggregates).toHaveLength(2);
  });
});

describe('classificação das partidas (§11.8)', () => {
  const base = constraintConfig({ seed: 'classify' });
  const run = (config: ProductionLineConfig) => ({ config, finalState: runToEnd(config) });

  it('mesma base e seed, melhoria diferente: intervenção controlada', () => {
    const attempt = buildInterventionConfig(base, 'b', stageId(2), 1, '');
    expect(classifyRunRelationship(run(base), run(attempt))).toBe('controlled_intervention');
    expect(sameDiceSequence(runToEnd(base), runToEnd(attempt))).toBe(true);
  });

  it('mesma melhoria e seed: reprodução', () => {
    const attempt = buildInterventionConfig(base, 'b', stageId(2), 1, '');
    expect(classifyRunRelationship(run(attempt), run({ ...attempt }))).toBe('reproduction');
  });

  it('outra seed é outro experimento, não intervenção', () => {
    const other = buildInterventionConfig({ ...base, seed: 'classify-2' }, 'b', stageId(2), 1, '');
    expect(classifyRunRelationship(run(base), run(other))).toBe('same_conditions_new_seed');
  });

  it('experiências diferentes: condições diferentes', () => {
    const legacy = createProductionLineConfig({ seed: 'classify', rounds: 20 });
    expect(classifyRunRelationship(run(base), run(legacy))).toBe('different_conditions');
  });
});

describe('validação dos perfis (§9)', () => {
  const base = constraintConfig();

  it('aceita base e tentativa válidas', () => {
    expect(validateConfig(base).valid).toBe(true);
    expect(validateConfig(buildInterventionConfig(base, 'b', stageId(1), 3, '')).valid).toBe(true);
  });

  it('rejeita bônus fora do padrão, melhoria na base e dois setores melhorados', () => {
    const bonus = { ...base, capacityProfiles: base.capacityProfiles.map((p, i) => (i === 0 ? { ...p, baseBonus: 5 } : p)) };
    expect(validateConfig(bonus).issues.some((i) => i.code === 'invalid_base_bonus')).toBe(true);

    const upgradedBase = { ...base, capacityProfiles: base.capacityProfiles.map((p, i) => (i === 0 ? { ...p, upgrade: 1 } : p)) };
    expect(validateConfig(upgradedBase).issues.some((i) => i.code === 'baseline_with_upgrade')).toBe(true);

    const attempt = buildInterventionConfig(base, 'b', stageId(1), 1, '');
    const twoUpgrades = { ...attempt, capacityProfiles: attempt.capacityProfiles.map((p, i) => (i === 3 ? { ...p, upgrade: 1 } : p)) };
    expect(validateConfig(twoUpgrades).issues.some((i) => i.code === 'invalid_upgrade_profile')).toBe(true);
  });

  it('rejeita melhoria que não bate com a intervenção declarada e acréscimo fora de 1–3', () => {
    const attempt = buildInterventionConfig(base, 'b', stageId(1), 2, '');
    const mismatch = { ...attempt, intervention: { ...attempt.intervention!, addedCapacity: 3 as AddedCapacity } };
    expect(validateConfig(mismatch).valid).toBe(false);
    const tooMuch = { ...attempt, intervention: { ...attempt.intervention!, addedCapacity: 4 as AddedCapacity } };
    expect(validateConfig(tooMuch).issues.some((i) => i.code === 'invalid_added_capacity')).toBe(true);
  });

  it('rejeita bônus na experiência antiga e setor de melhoria inexistente', () => {
    const legacy = createProductionLineConfig({ seed: 'x' });
    const withBonus = { ...legacy, capacityProfiles: legacy.capacityProfiles.map((p) => ({ ...p, baseBonus: 2 })) };
    expect(validateConfig(withBonus).issues.some((i) => i.code === 'legacy_mode_with_bonus')).toBe(true);

    const attempt = buildInterventionConfig(base, 'b', stageId(1), 1, '');
    const unknown = { ...attempt, intervention: { ...attempt.intervention!, targetStageId: 'stage-99' } };
    expect(validateConfig(unknown).issues.some((i) => i.code === 'unknown_intervention_target')).toBe(true);
  });
});
