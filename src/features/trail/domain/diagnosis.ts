/**
 * Diagnóstico de restrição pela capacidade — evolução pedagógica, frente 1.
 *
 * Usa só o ritmo de referência com a carga atual: a fórmula do motor
 * (`loadFactor` + `kmhToMps`), sem variabilidade e antes da limitação pela
 * fila. Nunca tempo limitado, mochila em kg absolutos, posição na fila ou
 * velocidade instantânea — esses são efeitos observados durante a execução,
 * não a capacidade em si (§3.2 do documento de evolução pedagógica).
 */

import type { AttemptConfig, CharacterId, CharacterState, FatigueParams } from './types';
import { computeLoadByCharacter, kmhToMps, loadFactor } from './engine';
import { fatigueFactor } from './fatigue';

/**
 * Tolerância de apresentação: até 1% acima do mínimo ainda conta como
 * candidata a restrição. Decisão de como apresentar a estimativa, não uma
 * lei da física do motor — registrada em `docs/decisions.md`.
 */
export const CAPACITY_CANDIDATE_TOLERANCE = 0.01;

export interface CapacityDiagnosis {
  /** Ritmo de referência com a carga, em km/h, por personagem. */
  referenceSpeedKmhByCharacter: Record<CharacterId, number>;
  minReferenceSpeedKmh: number;
  /** Quem está dentro da tolerância do mínimo — 1 candidata clara, ou várias em empate/proximidade. */
  candidateIds: CharacterId[];
}

/** Ritmo de referência com a carga, em km/h — mesma fórmula do motor, sem variabilidade e antes da fila. */
export function referenceSpeedWithLoadKmh(
  baseSpeedKmh: number,
  loadKg: number,
  referenceLoadKg: number,
): number {
  return kmhToMps(baseSpeedKmh) * loadFactor(loadKg, referenceLoadKg) * 3.6;
}

/**
 * Diagnóstico a partir de uma configuração (rascunho da preparação ou
 * snapshot de uma tentativa) — depende só da carga atual, nunca da ordem:
 * reordenar sem redistribuir não muda o resultado, por construção.
 */
export function diagnoseCapacity(config: AttemptConfig): CapacityDiagnosis {
  const loadByCharacter = computeLoadByCharacter(config);
  const referenceSpeedKmhByCharacter: Record<CharacterId, number> = {};

  for (const character of config.scenario.characters) {
    referenceSpeedKmhByCharacter[character.id] = referenceSpeedWithLoadKmh(
      character.baseSpeedKmh,
      loadByCharacter[character.id] ?? 0,
      character.referenceLoadKg,
    );
  }

  const speeds = Object.values(referenceSpeedKmhByCharacter);
  const minReferenceSpeedKmh = Math.min(...speeds);
  const threshold = minReferenceSpeedKmh * (1 + CAPACITY_CANDIDATE_TOLERANCE);

  const candidateIds = config.scenario.characters
    .map((character) => character.id)
    .filter((id) => referenceSpeedKmhByCharacter[id] <= threshold);

  return { referenceSpeedKmhByCharacter, minReferenceSpeedKmh, candidateIds };
}

/** Mesmo conjunto de candidatas, independente de ordem — usado para "a provável restrição mudou". */
export function sameCandidateSet(a: CharacterId[], b: CharacterId[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/**
 * Capacidade atual sem flutuação, em km/h — referência × fator de fadiga
 * (§7.4). Sem fadiga ativa (`fatigueParams.minFatigueFactor` não se aplica
 * porque quem chama já passa `energy = 1`), é igual ao ritmo de referência.
 */
export function currentCapacityKmh(
  baseSpeedKmh: number,
  loadKg: number,
  referenceLoadKg: number,
  energy: number,
  fatigueParams: FatigueParams,
): number {
  return referenceSpeedWithLoadKmh(baseSpeedKmh, loadKg, referenceLoadKg) * fatigueFactor(energy, fatigueParams.minFatigueFactor);
}

export interface LiveCapacityDiagnosis {
  /** Capacidade atual (com fadiga, sem flutuação) de TODO personagem, inclusive quem já chegou. */
  currentCapacityKmhByCharacter: Record<CharacterId, number>;
  /** `null` quando ninguém mais está ativo (todos chegaram). */
  minCurrentCapacityKmh: number | null;
  /** Só entre quem ainda não chegou — chegada não é migração por fadiga (§7.4). */
  candidateIds: CharacterId[];
  activeIds: CharacterId[];
}

/**
 * Diagnóstico "agora", durante uma execução com fadiga ativa: "Provável
 * restrição agora pela capacidade" (§7.4). Usa a capacidade atual (com
 * fadiga) em vez da referência estática, e só considera quem ainda não
 * chegou — comparar contra quem já chegou (capacidade "atual" congelada no
 * momento da chegada) confundiria chegada com migração.
 */
export function diagnoseCurrentCapacity(
  config: AttemptConfig,
  characters: Record<CharacterId, CharacterState>,
): LiveCapacityDiagnosis {
  const loadByCharacter = computeLoadByCharacter(config);
  const activeIds = config.order.filter((id) => characters[id].arrivalTimeSec === null);

  const currentCapacityKmhByCharacter: Record<CharacterId, number> = {};
  for (const character of config.scenario.characters) {
    currentCapacityKmhByCharacter[character.id] = currentCapacityKmh(
      character.baseSpeedKmh,
      loadByCharacter[character.id] ?? 0,
      character.referenceLoadKg,
      characters[character.id].energy,
      config.fatigueParams,
    );
  }

  if (activeIds.length === 0) {
    return { currentCapacityKmhByCharacter, minCurrentCapacityKmh: null, candidateIds: [], activeIds: [] };
  }

  const activeSpeeds = activeIds.map((id) => currentCapacityKmhByCharacter[id]);
  const minCurrentCapacityKmh = Math.min(...activeSpeeds);
  const threshold = minCurrentCapacityKmh * (1 + CAPACITY_CANDIDATE_TOLERANCE);
  const candidateIds = activeIds.filter((id) => currentCapacityKmhByCharacter[id] <= threshold);

  return { currentCapacityKmhByCharacter, minCurrentCapacityKmh, candidateIds, activeIds };
}
