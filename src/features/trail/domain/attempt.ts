/**
 * Criação de configurações de tentativa a partir de um cenário.
 *
 * O snapshot do cenário é profundo: uma tentativa concluída nunca é alterada
 * retroativamente por edições na preparação (R12).
 */

import type {
  AttemptConfig,
  CharacterId,
  ExperimentLink,
  FatigueMode,
  FatigueParams,
  GuidedStage,
  ItemId,
  Scenario,
  VariabilityMode,
} from './types';
import { ENGINE_VERSION, TICK_SEC } from './types';
import { DEFAULT_FATIGUE_PARAMS } from './fatigue';

export interface CreateAttemptOptions {
  seed?: string;
  order?: CharacterId[];
  ownerByItem?: Record<ItemId, CharacterId>;
  participantByCharacter?: Partial<Record<CharacterId, string>>;
  hypothesis?: string;
  guidedStage?: GuidedStage;
  variabilityMode?: VariabilityMode;
  fatigueMode?: FatigueMode;
  fatigueParams?: FatigueParams;
  experimentOf?: ExperimentLink;
}

export function createAttemptConfig(
  scenario: Scenario,
  options: CreateAttemptOptions = {},
): AttemptConfig {
  const snapshot = structuredClone(scenario);

  return {
    engineVersion: ENGINE_VERSION,
    scenario: snapshot,
    seed: options.seed ?? snapshot.defaultSeed,
    order: [...(options.order ?? snapshot.initialOrder)],
    ownerByItem: { ...(options.ownerByItem ?? snapshot.initialOwnerByItem) },
    participantByCharacter: { ...(options.participantByCharacter ?? {}) },
    hypothesis: options.hypothesis ?? '',
    variabilityMode: options.variabilityMode ?? 'standard',
    fatigueMode: options.fatigueMode ?? 'disabled',
    fatigueParams: options.fatigueParams ?? DEFAULT_FATIGUE_PARAMS,
    ...(options.experimentOf ? { experimentOf: options.experimentOf } : {}),
    guidedStage: options.guidedStage ?? 1,
    tickSec: TICK_SEC,
  };
}

/** Move itens de um personagem para outro, preservando a identidade de cada item. */
export function transferItems(
  config: AttemptConfig,
  itemIds: ItemId[],
  toCharacterId: CharacterId,
): AttemptConfig {
  const ownerByItem = { ...config.ownerByItem };

  for (const itemId of itemIds) {
    if (!(itemId in ownerByItem)) {
      throw new Error(`Item inexistente na tentativa: ${itemId}`);
    }
    ownerByItem[itemId] = toCharacterId;
  }

  return { ...config, ownerByItem };
}

/** Itens pertencentes a um personagem, em ordem estável. */
export function itemsOwnedBy(config: AttemptConfig, characterId: CharacterId): ItemId[] {
  return config.scenario.items
    .filter((item) => config.ownerByItem[item.id] === characterId)
    .map((item) => item.id);
}
