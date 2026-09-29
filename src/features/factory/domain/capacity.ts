/**
 * Perfis de capacidade (evolução "Restrição e melhoria do fluxo", §4).
 *
 * capacidade disponível = dado + bônus estrutural + melhoria. O bônus e a
 * melhoria não são sorteio e não entram na chave do RNG: o dado de cada setor
 * em cada dia continua o mesmo com ou sem intervenção, o que torna a
 * comparação controlada.
 */

import type { CapacityProfile, Experience, ProductionLineConfig, StageDefinition, StageId } from './types';
import { NON_CONSTRAINT_BONUS, REFERENCE_CAPACITY_PER_ROUND } from './types';

/** Índice zero-based da restrição original: o setor central (§4.1). */
export function constraintIndex(stageCount: number): number {
  return Math.floor(stageCount / 2);
}

export function baseProfiles(experience: Experience, stages: StageDefinition[]): CapacityProfile[] {
  const constrained = constraintIndex(stages.length);
  return stages.map((stage, index) => ({
    stageId: stage.id,
    baseBonus: experience === 'constraint-flow' && index !== constrained ? NON_CONSTRAINT_BONUS : 0,
    upgrade: 0,
  }));
}

export function profileFor(config: ProductionLineConfig, stageId: StageId): CapacityProfile {
  return config.capacityProfiles.find((profile) => profile.stageId === stageId) ?? { stageId, baseBonus: 0, upgrade: 0 };
}

export function availableCapacity(config: ProductionLineConfig, stageId: StageId, die: number): number {
  const profile = profileFor(config, stageId);
  return die + profile.baseBonus + profile.upgrade;
}

/** Capacidade média configurada do setor: 3,5 do dado + bônus + melhoria. */
export function nominalMeanCapacity(config: ProductionLineConfig, stageId: StageId): number {
  const profile = profileFor(config, stageId);
  return REFERENCE_CAPACITY_PER_ROUND + profile.baseBonus + profile.upgrade;
}

export function nominalMeanByStage(config: ProductionLineConfig): Record<StageId, number> {
  return Object.fromEntries(config.stages.map((stage) => [stage.id, nominalMeanCapacity(config, stage.id)]));
}

export interface StructuralDiagnosis {
  meanByStage: Record<StageId, number>;
  minMean: number;
  /** Setores empatados na menor capacidade média — um só quando há restrição única. */
  constrainedStageIds: StageId[];
  isTie: boolean;
  originalConstraintStageId: StageId | null;
  /** A restrição original continua sendo a única de menor média. */
  originalIsUniqueConstraint: boolean;
}

/**
 * Diagnóstico estrutural (§6.2): menor capacidade MÉDIA configurada. Não usa
 * transferência, fila, dado de um dia nem utilização — isso é evidência
 * observada, apresentada à parte.
 */
export function diagnoseConstraint(config: ProductionLineConfig): StructuralDiagnosis {
  const meanByStage = nominalMeanByStage(config);
  const minMean = Math.min(...Object.values(meanByStage));
  const constrainedStageIds = config.stages.map((stage) => stage.id).filter((id) => meanByStage[id] === minMean);
  const original = config.originalConstraintStageId;
  return {
    meanByStage,
    minMean,
    constrainedStageIds,
    isTie: constrainedStageIds.length > 1,
    originalConstraintStageId: original,
    originalIsUniqueConstraint: original !== null && constrainedStageIds.length === 1 && constrainedStageIds[0] === original,
  };
}
