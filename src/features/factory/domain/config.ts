/**
 * Construção de `ProductionLineConfig` — nomes padrão de setor e geração de
 * seed (guia §1.1, §5).
 *
 * IDs de etapa são posicionais (`stage-0`, `stage-1`, ...) porque a ordem das
 * etapas nunca muda durante nem entre a criação de uma partida (§4.2 — ao
 * contrário da trilha, este exercício não tem reorganização em nenhuma
 * etapa), então não há necessidade de IDs estáveis independentes de posição.
 */

import type { AddedCapacity, Experience, Horizon, ProductionLineConfig, StageDefinition, StageId } from './types';
import { CAPACITY_MODEL_VERSION, ENGINE_VERSION } from './types';
import { HYPOTHESIS_MAX_LENGTH } from './validation';
import { RNG_VERSION } from './random';
import { baseProfiles, constraintIndex } from './capacity';

export const DEFAULT_STAGE_COUNT = 5;
export const DEFAULT_HORIZON: Horizon = 10;

/** Horizonte padrão de cada experiência (§4.1: 20 dias recomendados para "Restrição e fluxo"). */
export const DEFAULT_HORIZON_BY_EXPERIENCE: Record<Experience, Horizon> = {
  'dependency-variability': 10,
  'constraint-flow': 20,
};

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  'dependency-variability': 'Dependência e variabilidade',
  'constraint-flow': 'Restrição e melhoria do fluxo',
};

const FIVE_STAGE_NAMES = ['Usinagem', 'Tratamento superficial', 'Pintura', 'Inspeção', 'Expedição'];

/**
 * Rótulo padrão do setor pela posição. A linha de cinco usa os nomes
 * temáticos do §1.1; qualquer outra contagem usa "Setor N", identificando
 * primeiro e último como entrada/saída, sem inventar uma cadeia aeronáutica
 * "real" para quantidades diferentes de cinco.
 */
export function defaultSectorName(index: number, stageCount: number): string {
  if (stageCount === 5) return FIVE_STAGE_NAMES[index];
  if (index === 0) return 'Setor 1 (entrada)';
  if (index === stageCount - 1) return `Setor ${stageCount} (saída)`;
  return `Setor ${index + 1}`;
}

export function stageId(index: number): StageId {
  return `stage-${index}`;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateProductionLineConfigOptions {
  stageCount?: number;
  rounds?: Horizon;
  hypothesis?: string;
  seed?: string;
  experience?: Experience;
  experimentId?: string;
  /** Nome de quem representa cada setor — metadado, indexado por ID de etapa (§1.1, §10). */
  participantNameByStage?: Partial<Record<StageId, string>>;
}

export function createProductionLineConfig(
  options: CreateProductionLineConfigOptions = {},
): ProductionLineConfig {
  const stageCount = options.stageCount ?? DEFAULT_STAGE_COUNT;
  const experience = options.experience ?? 'dependency-variability';
  const isConstraintFlow = experience === 'constraint-flow';

  const stages: StageDefinition[] = Array.from({ length: stageCount }, (_, index) => {
    const id = stageId(index);
    return {
      id,
      sectorName: defaultSectorName(index, stageCount),
      participantName: options.participantNameByStage?.[id]?.trim() ?? '',
    };
  });

  return {
    engineVersion: ENGINE_VERSION,
    rngVersion: RNG_VERSION,
    seed: options.seed ?? generateId('seed'),
    stages,
    rounds: options.rounds ?? DEFAULT_HORIZON_BY_EXPERIENCE[experience],
    hypothesis: (options.hypothesis ?? '').slice(0, HYPOTHESIS_MAX_LENGTH),
    initialInventory: 'empty',
    capacityModel: 'fair-d6',
    experience,
    capacityModelVersion: CAPACITY_MODEL_VERSION,
    capacityProfiles: baseProfiles(experience, stages),
    originalConstraintStageId: isConstraintFlow ? stages[constraintIndex(stageCount)].id : null,
    experimentId: isConstraintFlow ? (options.experimentId ?? generateId('experiment')) : null,
    intervention: null,
  };
}

/**
 * Configuração da linha de base de onde uma tentativa deriva: mesmos perfis,
 * sem melhoria. Recuperável da própria tentativa, mesmo que o resultado da
 * base tenha sido excluído do histórico (§9).
 */
export function baselineConfigOf(config: ProductionLineConfig): ProductionLineConfig {
  return {
    ...config,
    capacityProfiles: config.capacityProfiles.map((profile) => ({ ...profile, upgrade: 0 })),
    intervention: null,
  };
}

/**
 * "Nova sequência de dados" a partir de uma partida: mesma linha, seed nova —
 * e, em "Restrição e fluxo", um experimento novo com uma nova linha de base.
 * Outra seed nunca é tratada como tentativa do experimento anterior (§5).
 */
export function withNewSeed(config: ProductionLineConfig): ProductionLineConfig {
  const base = baselineConfigOf(config);
  return {
    ...base,
    seed: generateId('seed'),
    experimentId: base.experience === 'constraint-flow' ? generateId('experiment') : null,
  };
}

/**
 * Tentativa de melhoria (§5): deriva SEMPRE da linha de base — mesma seed,
 * horizonte, ordem, IDs e perfis —, com o acréscimo em um único setor.
 * Melhorias de tentativas anteriores nunca se acumulam.
 */
export function buildInterventionConfig(
  source: ProductionLineConfig,
  baselineRunId: string,
  targetStageId: StageId,
  addedCapacity: AddedCapacity,
  prediction: string,
): ProductionLineConfig {
  const base = baselineConfigOf(source);
  return {
    ...base,
    capacityProfiles: base.capacityProfiles.map((profile) =>
      profile.stageId === targetStageId ? { ...profile, upgrade: addedCapacity } : profile,
    ),
    intervention: {
      baselineRunId,
      targetStageId,
      addedCapacity,
      prediction: prediction.slice(0, HYPOTHESIS_MAX_LENGTH),
    },
  };
}
