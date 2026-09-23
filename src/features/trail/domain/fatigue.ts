/**
 * Modelo de energia e fadiga — evolução pedagógica, frente 5.
 *
 * Modelo didático proposto para o software, não uma fórmula extraída do
 * livro nem um modelo fisiológico validado (§7.1). Uma única reserva
 * `energy` em [0, 1] por personagem; fadiga é o efeito derivado dela sobre a
 * velocidade — não existe um segundo medidor independente.
 */

import type { FatigueParams } from './types';

/** Versão do modelo — sobe se a fórmula mudar, para não comparar semânticas incompatíveis. */
export const FATIGUE_MODEL_VERSION = 'fatigue-1';

/**
 * Valores iniciais para calibração, não constantes cientificamente validadas
 * (§7.2). Globais e iguais para todos — não há resistência individual
 * sorteada.
 */
export const DEFAULT_FATIGUE_PARAMS: FatigueParams = {
  version: FATIGUE_MODEL_VERSION,
  drainPerSec: 1 / 10800,
  loadDrainCoefficient: 0.5,
  minFatigueFactor: 0.6,
};

/**
 * Multiplicador de capacidade pela reserva de energia:
 * `minFatigueFactor + (1 - minFatigueFactor) * energy`. Em `energy = 1`
 * (cheio), o multiplicador é 1 — nenhum efeito. Em `energy = 0`, o
 * multiplicador é `minFatigueFactor` — o piso, não uma parada (§7.2).
 */
export function fatigueFactor(energy: number, minFatigueFactor: number): number {
  return minFatigueFactor + (1 - minFatigueFactor) * energy;
}

export interface FatigueParamsValidation {
  valid: boolean;
  issues: string[];
}

/** `drainPerSec > 0`, `loadDrainCoefficient >= 0`, `0 < minFatigueFactor <= 1` — os limites que o documento pede (§7.2). */
export function validateFatigueParams(params: FatigueParams): FatigueParamsValidation {
  const issues: string[] = [];

  if (!Number.isFinite(params.drainPerSec) || params.drainPerSec <= 0) {
    issues.push('drainPerSec precisa ser finito e maior que zero.');
  }
  if (!Number.isFinite(params.loadDrainCoefficient) || params.loadDrainCoefficient < 0) {
    issues.push('loadDrainCoefficient precisa ser finito e não negativo.');
  }
  if (!Number.isFinite(params.minFatigueFactor) || params.minFatigueFactor <= 0 || params.minFatigueFactor > 1) {
    issues.push('minFatigueFactor precisa ser finito e estar no intervalo (0, 1].');
  }

  return { valid: issues.length === 0, issues };
}
