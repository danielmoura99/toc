/**
 * Invariantes e validação de configuração (guia §10: "recusar
 * inconsistências... não confiar em totais arbitrários do JSON").
 */

import type { ProductionLineConfig, StageId, ValidationIssue, ValidationResult } from './types';
import { CAPACITY_MODEL_VERSION, ENGINE_VERSION, MAX_STAGE_COUNT, MIN_STAGE_COUNT, NON_CONSTRAINT_BONUS } from './types';
import { constraintIndex } from './capacity';

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

  capacityIssues(config).forEach((issue) => issues.push(issue));

  return { valid: issues.length === 0, issues };
}

const VALID_UPGRADES = new Set([1, 2, 3]);

/**
 * Invariantes dos perfis de capacidade (evolução "Restrição e fluxo", §9):
 *  - experiência antiga: bônus e melhoria zero, sem restrição, experimento ou intervenção;
 *  - linha de base: bônus 0 exatamente no setor central, 2 nos demais, nenhuma melhoria;
 *  - tentativa: mesmos bônus e exatamente um setor com melhoria 1, 2 ou 3, o da intervenção.
 */
function capacityIssues(config: ProductionLineConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, path?: string) => issues.push({ code, message, path });

  if (config.experience !== 'dependency-variability' && config.experience !== 'constraint-flow') {
    add('invalid_experience', 'Experiência desconhecida.', 'experience');
    return issues;
  }

  if (config.capacityModelVersion !== CAPACITY_MODEL_VERSION) {
    add(
      'capacity_model_version_mismatch',
      `Modelo de capacidade incompatível: esperado ${CAPACITY_MODEL_VERSION}, recebido ${config.capacityModelVersion}.`,
      'capacityModelVersion',
    );
  }

  const profiles = config.capacityProfiles;
  if (!Array.isArray(profiles) || profiles.length !== config.stages.length) {
    add('invalid_capacity_profiles', 'Deve haver exatamente um perfil de capacidade por setor.', 'capacityProfiles');
    return issues;
  }

  const outOfOrder = profiles.some((profile, index) => profile.stageId !== config.stages[index]?.id);
  if (outOfOrder) {
    add('capacity_profile_stage_mismatch', 'Os perfis de capacidade devem seguir os mesmos setores, na mesma ordem.', 'capacityProfiles');
  }

  const nonInteger = profiles.some(
    (profile) => !Number.isInteger(profile.baseBonus) || !Number.isInteger(profile.upgrade) || profile.baseBonus < 0 || profile.upgrade < 0,
  );
  if (nonInteger) {
    add('invalid_capacity_values', 'Bônus e melhoria devem ser inteiros não negativos.', 'capacityProfiles');
  }

  if (config.experience === 'dependency-variability') {
    if (profiles.some((profile) => profile.baseBonus !== 0 || profile.upgrade !== 0)) {
      add('legacy_mode_with_bonus', 'Em "Dependência e variabilidade" a capacidade é só o dado — bônus e melhoria devem ser zero.', 'capacityProfiles');
    }
    if (config.originalConstraintStageId !== null || config.experimentId !== null || config.intervention !== null) {
      add('legacy_mode_with_experiment', 'Em "Dependência e variabilidade" não há restrição configurada, experimento nem intervenção.', 'experience');
    }
    return issues;
  }

  const central = constraintIndex(config.stages.length);
  const bonusMismatch = profiles.some((profile, index) => profile.baseBonus !== (index === central ? 0 : NON_CONSTRAINT_BONUS));
  if (bonusMismatch) {
    add(
      'invalid_base_bonus',
      `A linha de base deve ter bônus 0 no setor central e ${NON_CONSTRAINT_BONUS} nos demais.`,
      'capacityProfiles',
    );
  }

  if (config.originalConstraintStageId !== config.stages[central]?.id) {
    add('invalid_original_constraint', 'A restrição original deve ser o setor central.', 'originalConstraintStageId');
  }

  if (typeof config.experimentId !== 'string' || config.experimentId.length === 0) {
    add('invalid_experiment_id', 'Uma partida de "Restrição e fluxo" precisa de um experimento.', 'experimentId');
  }

  const upgraded = profiles.filter((profile) => profile.upgrade !== 0);
  const intervention = config.intervention;
  if (intervention === null) {
    if (upgraded.length > 0) {
      add('baseline_with_upgrade', 'A linha de base não pode ter melhoria de capacidade.', 'capacityProfiles');
    }
    return issues;
  }

  if (!VALID_UPGRADES.has(intervention.addedCapacity)) {
    add('invalid_added_capacity', 'O acréscimo deve ser +1, +2 ou +3 lotes por dia.', 'intervention.addedCapacity');
  }
  if (!config.stages.some((stage) => stage.id === intervention.targetStageId)) {
    add('unknown_intervention_target', `Setor da melhoria desconhecido: ${intervention.targetStageId}.`, 'intervention.targetStageId');
  }
  if (typeof intervention.baselineRunId !== 'string' || intervention.baselineRunId.length === 0) {
    add('missing_baseline_link', 'A tentativa precisa identificar a linha de base.', 'intervention.baselineRunId');
  }
  if (
    upgraded.length !== 1 ||
    upgraded[0].stageId !== intervention.targetStageId ||
    upgraded[0].upgrade !== intervention.addedCapacity
  ) {
    add(
      'invalid_upgrade_profile',
      'Exatamente um setor — o da intervenção — deve receber a melhoria declarada; os demais ficam sem melhoria.',
      'capacityProfiles',
    );
  }

  return issues;
}
