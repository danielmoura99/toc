/**
 * Aleatoriedade determinística e reproduzível.
 *
 * O sorteio é uma função pura de (seed, personagem, bloco). Ele NÃO depende da
 * posição na fila, da ordem de iteração, do frame, do relógio do sistema nem de
 * qualquer estado acumulado. É isso que garante a exigência do guia (§7.3):
 * mover um personagem de posição preserva a sequência de variações que ele
 * recebe nos mesmos instantes simulados.
 *
 * O algoritmo é didático, não criptográfico.
 */

import type { CharacterId } from './types';
import { VARIABILITY_BLOCK_SEC } from './types';

/** Versão do algoritmo de aleatoriedade. Mudar invalida comparações antigas. */
export const RANDOM_VERSION = 'fnv1a32-mix-1';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32_RANGE = 2 ** 32;

/**
 * FNV-1a de 32 bits sobre uma string UTF-16, sem mistura final.
 * Coberto por vetores de teste oficiais em tests/domain/random.test.ts.
 */
export function fnv1a32Raw(input: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiplicação de 32 bits sem perder precisão em ponto flutuante.
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

/**
 * Mistura final (avalanche) no estilo do finalizador do MurmurHash3. Sozinho, o
 * FNV-1a concentra pouca entropia nos bits altos, que são justamente os que mais
 * pesam ao dividir por 2**32.
 */
export function finalMix(hash32: number): number {
  let hash = hash32 >>> 0;

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/** FNV-1a de 32 bits com mistura final. */
export function fnv1a32(input: string): number {
  return finalMix(fnv1a32Raw(input));
}

/** Chave serializada sem ambiguidades para o sorteio. */
export function randomKey(seed: string, characterId: CharacterId, blockIndex: number): string {
  return JSON.stringify([seed, characterId, blockIndex]);
}

/**
 * Sorteio determinístico no intervalo [0, 1).
 */
export function deterministicRandom(
  seed: string,
  characterId: CharacterId,
  blockIndex: number,
): number {
  return fnv1a32(randomKey(seed, characterId, blockIndex)) / UINT32_RANGE;
}

/** Índice do bloco de variabilidade para um instante simulado, em segundos. */
export function blockIndexForTime(elapsedSec: number, blockSec: number = VARIABILITY_BLOCK_SEC): number {
  return Math.floor(elapsedSec / blockSec);
}

/**
 * Fator multiplicativo de variação do ritmo no bloco: 1 + variabilidade × (2u - 1).
 * Resultado em [1 - variabilidade, 1 + variabilidade).
 */
export function variationFactor(
  seed: string,
  characterId: CharacterId,
  blockIndex: number,
  variability: number,
): number {
  const u = deterministicRandom(seed, characterId, blockIndex);
  return 1 + variability * (2 * u - 1);
}
