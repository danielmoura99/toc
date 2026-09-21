/**
 * Invariantes e validação de configuração.
 *
 * Valida a validade física no domínio. As permissões por etapa guiada são
 * responsabilidade da camada de aplicação.
 */

import type { AttemptConfig, CharacterId, ValidationIssue, ValidationResult } from './types';
import {
  ENGINE_VERSION,
  MAX_LOAD_FACTOR,
  TICK_SEC,
  VARIABILITY_BLOCK_SEC,
} from './types';
import { computeLoadByCharacter } from './engine';

const MAX_VARIABILITY = 0.5;

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateConfig(config: AttemptConfig): ValidationResult {
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

  if (config.tickSec !== TICK_SEC) {
    add('invalid_tick', `O passo de simulação deve ser ${TICK_SEC} s.`, 'tickSec');
  }

  const scenario = config.scenario;

  if (scenario.variabilityBlockSec !== VARIABILITY_BLOCK_SEC) {
    add(
      'invalid_variability_block',
      `O bloco de variabilidade deve ser ${VARIABILITY_BLOCK_SEC} s.`,
      'scenario.variabilityBlockSec',
    );
  }

  if (!isFinitePositive(scenario.distanceM)) {
    add('invalid_distance', 'A distância deve ser positiva e finita.', 'scenario.distanceM');
  }

  if (!isFinitePositive(scenario.timeLimitSec)) {
    add('invalid_time_limit', 'O limite de tempo deve ser positivo e finito.', 'scenario.timeLimitSec');
  }

  if (typeof config.seed !== 'string' || config.seed.length === 0) {
    add('invalid_seed', 'A seed deve ser uma string não vazia.', 'seed');
  }

  // --- Elenco ---
  const castIds = new Set<CharacterId>();

  for (const character of scenario.characters) {
    if (castIds.has(character.id)) {
      add('duplicate_character', `Personagem duplicado no elenco: ${character.id}.`, 'scenario.characters');
    }
    castIds.add(character.id);

    if (!isFinitePositive(character.baseSpeedKmh)) {
      add('invalid_base_speed', `Ritmo base inválido para ${character.id}.`, `scenario.characters.${character.id}`);
    }

    if (!isFinitePositive(character.referenceLoadKg)) {
      add('invalid_reference_load', `Carga de referência inválida para ${character.id}.`, `scenario.characters.${character.id}`);
    }

    if (!isFinitePositive(character.maxLoadKg)) {
      add('invalid_max_load', `Carga máxima inválida para ${character.id}.`, `scenario.characters.${character.id}`);
    }

    // Fonte única da regra: maxLoadKg é sempre derivado. Um JSON importado que
    // traga outro valor é rejeitado — uma exceção exigiria mudança explícita
    // da regra e novo versionamento.
    const expectedMaxLoadKg = MAX_LOAD_FACTOR * character.referenceLoadKg;
    if (isFinitePositive(character.referenceLoadKg) && character.maxLoadKg !== expectedMaxLoadKg) {
      add(
        'max_load_not_derived',
        `Carga máxima de ${character.id} deve ser ${expectedMaxLoadKg} kg (${MAX_LOAD_FACTOR} × ${character.referenceLoadKg} kg), e não ${character.maxLoadKg} kg.`,
        `scenario.characters.${character.id}.maxLoadKg`,
      );
    }

    if (
      typeof character.variability !== 'number' ||
      !Number.isFinite(character.variability) ||
      character.variability < 0 ||
      character.variability > MAX_VARIABILITY
    ) {
      add(
        'invalid_variability',
        `Variabilidade de ${character.id} deve estar entre 0 e ${MAX_VARIABILITY}.`,
        `scenario.characters.${character.id}.variability`,
      );
    }
  }

  // --- Ordem ---
  const orderIds = new Set<CharacterId>(config.order);

  if (config.order.length !== orderIds.size) {
    add('duplicate_in_order', 'A ordem contém personagens repetidos.', 'order');
  }

  if (config.order.length !== scenario.characters.length) {
    add(
      'order_size_mismatch',
      `A ordem deve conter exatamente ${scenario.characters.length} personagens.`,
      'order',
    );
  }

  for (const characterId of config.order) {
    if (!castIds.has(characterId)) {
      add('unknown_in_order', `Personagem desconhecido na ordem: ${characterId}.`, 'order');
    }
  }

  for (const character of scenario.characters) {
    if (!orderIds.has(character.id)) {
      add('missing_in_order', `Personagem ausente da ordem: ${character.id}.`, 'order');
    }
  }

  // --- Itens ---
  const itemIds = new Set<string>();

  for (const item of scenario.items) {
    if (itemIds.has(item.id)) {
      add('duplicate_item', `Item duplicado: ${item.id}.`, 'scenario.items');
    }
    itemIds.add(item.id);

    if (!isFinitePositive(item.weightKg)) {
      add('invalid_item_weight', `Peso inválido para o item ${item.id}.`, `scenario.items.${item.id}`);
    }

    const ownerId = config.ownerByItem[item.id];
    if (ownerId === undefined) {
      add('item_without_owner', `Item sem dono: ${item.id}.`, 'ownerByItem');
    } else if (!castIds.has(ownerId)) {
      add('item_unknown_owner', `Item ${item.id} atribuído a personagem desconhecido: ${ownerId}.`, 'ownerByItem');
    }
  }

  for (const itemId of Object.keys(config.ownerByItem)) {
    if (!itemIds.has(itemId)) {
      add('unknown_item_owned', `Dono definido para item inexistente: ${itemId}.`, 'ownerByItem');
    }
  }

  // --- Carga resultante ---
  const loadByCharacter = computeLoadByCharacter(config);

  for (const character of scenario.characters) {
    const loadKg = loadByCharacter[character.id] ?? 0;
    if (loadKg > character.maxLoadKg) {
      add(
        'overloaded',
        `${character.displayName} está com ${loadKg} kg, acima do limite de ${character.maxLoadKg} kg.`,
        `ownerByItem.${character.id}`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

/** Conservação de itens: mesmos IDs e mesmo peso total entre duas configurações. */
export function conservesItems(a: AttemptConfig, b: AttemptConfig): boolean {
  const idsA = Object.keys(a.ownerByItem).sort();
  const idsB = Object.keys(b.ownerByItem).sort();

  if (idsA.length !== idsB.length) return false;
  if (!idsA.every((id, index) => id === idsB[index])) return false;

  const totalA = a.scenario.items.reduce((sum, item) => sum + item.weightKg, 0);
  const totalB = b.scenario.items.reduce((sum, item) => sum + item.weightKg, 0);

  return totalA === totalB;
}
