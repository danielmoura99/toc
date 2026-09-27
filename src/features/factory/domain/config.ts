/**
 * Construção de `ProductionLineConfig` — nomes padrão de setor e geração de
 * seed (guia §1.1, §5).
 *
 * IDs de etapa são posicionais (`stage-0`, `stage-1`, ...) porque a ordem das
 * etapas nunca muda durante nem entre a criação de uma partida (§4.2 — ao
 * contrário da trilha, este exercício não tem reorganização em nenhuma
 * etapa), então não há necessidade de IDs estáveis independentes de posição.
 */

import type { Horizon, ProductionLineConfig, StageDefinition, StageId } from './types';
import { ENGINE_VERSION } from './types';
import { HYPOTHESIS_MAX_LENGTH } from './validation';
import { RNG_VERSION } from './random';

export const DEFAULT_STAGE_COUNT = 5;
export const DEFAULT_HORIZON: Horizon = 10;

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

function generateSeed(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateProductionLineConfigOptions {
  stageCount?: number;
  rounds?: Horizon;
  hypothesis?: string;
  seed?: string;
  /** Nome de quem representa cada setor — metadado, indexado por ID de etapa (§1.1, §10). */
  participantNameByStage?: Partial<Record<StageId, string>>;
}

export function createProductionLineConfig(
  options: CreateProductionLineConfigOptions = {},
): ProductionLineConfig {
  const stageCount = options.stageCount ?? DEFAULT_STAGE_COUNT;

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
    seed: options.seed ?? generateSeed(),
    stages,
    rounds: options.rounds ?? DEFAULT_HORIZON,
    hypothesis: (options.hypothesis ?? '').slice(0, HYPOTHESIS_MAX_LENGTH),
    initialInventory: 'empty',
    capacityModel: 'fair-d6',
  };
}
