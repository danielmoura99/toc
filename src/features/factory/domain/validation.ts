/**
 * Invariantes e validação de configuração (guia §10: "recusar
 * inconsistências... não confiar em totais arbitrários do JSON").
 */

import type { ProductionLineConfig, StageId, ValidationIssue, ValidationResult } from './types';
import { ENGINE_VERSION, MAX_STAGE_COUNT, MIN_STAGE_COUNT } from './types';

export const HYPOTHESIS_MAX_LENGTH = 500;

const VALID_ROUNDS = new Set([10, 20, 30]);

export function validateConfig(config: ProductionLineConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, path?: string) => {
    issues.push({ code, message, path });
  };

  if (config.engineVersion !== ENGINE_VERSION) {
    add(
      'engine_version_mismatch',
      `Versão do motor incompatível: esperada ${ENGINE_VERSION}, recebida ${config.engineVersion}.`,
      'engineVersion',
    );
  }

  if (typeof config.rngVersion !== 'string' || config.rngVersion.length === 0) {
    add('invalid_rng_version', 'A versão do sorteio deve ser uma string não vazia.', 'rngVersion');
  }

  if (typeof config.seed !== 'string' || config.seed.length === 0) {
    add('invalid_seed', 'A seed deve ser uma string não vazia.', 'seed');
  }

  if (!VALID_ROUNDS.has(config.rounds)) {
    add('invalid_rounds', 'O horizonte deve ser 10, 20 ou 30 rodadas.', 'rounds');
  }

  if (config.capacityModel !== 'fair-d6') {
    add('invalid_capacity_model', 'O modelo de capacidade deve ser "fair-d6".', 'capacityModel');
  }

  if (config.initialInventory !== 'empty') {
    add('invalid_initial_inventory', 'O estoque inicial deve ser "empty".', 'initialInventory');
  }

  if (config.hypothesis.length > HYPOTHESIS_MAX_LENGTH) {
    add(
      'hypothesis_too_long',
      `A hipótese deve ter no máximo ${HYPOTHESIS_MAX_LENGTH} caracteres.`,
      'hypothesis',
    );
  }

  const stageCount = config.stages.length;
  if (stageCount < MIN_STAGE_COUNT || stageCount > MAX_STAGE_COUNT) {
    add(
      'invalid_stage_count',
      `O número de setores deve estar entre ${MIN_STAGE_COUNT} e ${MAX_STAGE_COUNT}.`,
      'stages',
    );
  }

  const seenIds = new Set<StageId>();
  for (const stage of config.stages) {
    if (seenIds.has(stage.id)) {
      add('duplicate_stage', `Setor duplicado: ${stage.id}.`, 'stages');
    }
    seenIds.add(stage.id);

    if (typeof stage.sectorName !== 'string' || stage.sectorName.trim().length === 0) {
      add('invalid_sector_name', `Nome de setor vazio para ${stage.id}.`, `stages.${stage.id}.sectorName`);
    }
  }

  return { valid: issues.length === 0, issues };
}
