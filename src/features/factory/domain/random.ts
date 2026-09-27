/**
 * Sorteio determinístico do dado (guia §5).
 *
 * Reaproveita o primitivo de hash puro e versionado já usado pela trilha
 * (`fnv1a32`, FNV-1a de 32 bits com mistura final estilo MurmurHash3) — só o
 * formato da chave muda: aqui é `[versãoDoRng, seed, stageId, roundIndex]`,
 * como o guia pede explicitamente (§5), em vez de `[seed, characterId,
 * blockIndex]` da trilha. Por isso a versão tem nome próprio: embora o
 * algoritmo de hash seja o mesmo, a chave serializada é diferente, e duas
 * chaves diferentes não podem compartilhar rótulo de versão.
 */

import { fnv1a32 } from '@/features/trail/domain/random';

import type { StageId } from './types';
import { DIE_MAX, DIE_MIN } from './types';

/** Versão do algoritmo de sorteio. Mudar invalida reproduções antigas. */
export const RNG_VERSION = 'fnv1a32-mix-1-d6';

const UINT32_RANGE = 2 ** 32;

/** Chave serializada sem ambiguidades para o sorteio de um turno. */
export function dieRollKey(rngVersion: string, seed: string, stageId: StageId, roundIndex: number): string {
  return JSON.stringify([rngVersion, seed, stageId, roundIndex]);
}

/**
 * Sorteio determinístico no intervalo [0, 1) para um turno — função pura de
 * (versão, seed, etapa, rodada). Não depende de posição na fila nem de
 * nenhum estado acumulado.
 */
function deterministicUnit(rngVersion: string, seed: string, stageId: StageId, roundIndex: number): number {
  return fnv1a32(dieRollKey(rngVersion, seed, stageId, roundIndex)) / UINT32_RANGE;
}

/**
 * Resultado do dado (1 a 6) para uma etapa numa rodada — dado justo de seis
 * faces, mesma distribuição para toda etapa, sem ajuste por nome, posição ou
 * desempenho anterior (TG01). `deterministicUnit` está em [0, 1) por
 * construção (é um inteiro de 32 bits dividido por 2**32), então
 * `Math.floor(u * 6)` cai em [0, 5] e nunca precisa de arredondamento.
 */
export function rollDie(rngVersion: string, seed: string, stageId: StageId, roundIndex: number): number {
  const u = deterministicUnit(rngVersion, seed, stageId, roundIndex);
  return DIE_MIN + Math.floor(u * (DIE_MAX - DIE_MIN + 1));
}
