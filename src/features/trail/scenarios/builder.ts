/**
 * Construção de cenários versionados.
 *
 * maxLoadKg nunca é escrito à mão: é sempre derivado de referenceLoadKg, para
 * não existirem duas fontes de verdade. A validação rejeita qualquer cenário
 * importado cujo maxLoadKg divirja dessa fórmula.
 */

import type {
  CharacterDefinition,
  CharacterId,
  ItemId,
  Scenario,
  SupplyItem,
} from '../domain/types';
import { MAX_LOAD_FACTOR, VARIABILITY_BLOCK_SEC } from '../domain/types';

/** Carga máxima permitida para uma carga de referência. Fonte única da regra. */
export function deriveMaxLoadKg(referenceLoadKg: number): number {
  return MAX_LOAD_FACTOR * referenceLoadKg;
}

export interface CharacterSpec {
  id: CharacterId;
  displayName: string;
  baseSpeedKmh: number;
  referenceLoadKg: number;
  variability: number;
}

export interface ScenarioSpec {
  id: string;
  revision: number;
  distanceM: number;
  timeLimitSec: number;
  defaultSeed: string;
  characters: CharacterSpec[];
  initialOrder: CharacterId[];
  /** Quantidade de itens de 1 kg que cada personagem carrega no início. */
  initialLoadKgByCharacter: Record<CharacterId, number>;
}

/** Peso de cada unidade de suprimento, em kg. */
const SUPPLY_ITEM_WEIGHT_KG = 1;

export function buildScenario(spec: ScenarioSpec): Scenario {
  const characters: CharacterDefinition[] = spec.characters.map((character) => ({
    id: character.id,
    displayName: character.displayName,
    baseSpeedKmh: character.baseSpeedKmh,
    referenceLoadKg: character.referenceLoadKg,
    maxLoadKg: deriveMaxLoadKg(character.referenceLoadKg),
    variability: character.variability,
  }));

  const items: SupplyItem[] = [];
  const initialOwnerByItem: Record<ItemId, CharacterId> = {};

  // Itens recebem IDs estáveis e previsíveis, derivados do dono inicial.
  // Cada item de 1 kg tem identidade própria: nada é duplicado ou perdido
  // quando a carga é redistribuída na preparação.
  for (const character of spec.characters) {
    const loadKg = spec.initialLoadKgByCharacter[character.id] ?? 0;
    const unitCount = Math.round(loadKg / SUPPLY_ITEM_WEIGHT_KG);

    for (let index = 1; index <= unitCount; index += 1) {
      const itemId = `${character.id}-s${String(index).padStart(2, '0')}`;
      items.push({
        id: itemId,
        label: `Suprimento ${SUPPLY_ITEM_WEIGHT_KG} kg`,
        weightKg: SUPPLY_ITEM_WEIGHT_KG,
      });
      initialOwnerByItem[itemId] = character.id;
    }
  }

  return {
    id: spec.id,
    revision: spec.revision,
    distanceM: spec.distanceM,
    timeLimitSec: spec.timeLimitSec,
    variabilityBlockSec: VARIABILITY_BLOCK_SEC,
    characters,
    items,
    initialOrder: [...spec.initialOrder],
    initialOwnerByItem,
    defaultSeed: spec.defaultSeed,
  };
}

/** Cópia profunda do cenário, para que uma tentativa nunca compartilhe referência mutável. */
export function snapshotScenario(scenario: Scenario): Scenario {
  return structuredClone(scenario);
}
