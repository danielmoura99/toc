/**
 * Leitura interpretável do movimento de um personagem selecionado — evolução
 * pedagógica, frente 3. Puro: só interpreta o que o motor já calculou
 * (`CharacterState.isLimited`, posições) — não introduz nenhuma regra física
 * nova, nem epsilon do domínio (`EPSILON_M` continua exclusivo do motor).
 */

import type { CharacterState } from './types';

export type ObservedState = 'arrived' | 'no_predecessor' | 'limited' | 'increasing' | 'decreasing' | 'stable';

/**
 * Tolerância de apresentação para "espaço estável": variações de distância
 * menores que isto, entre uma amostra e outra, são ruído de precisão do
 * gráfico, não uma tendência real — decisão de como descrever a observação,
 * não da física do motor (mesmo espírito de `CAPACITY_CANDIDATE_TOLERANCE`).
 */
export const SPREAD_TREND_EPSILON_M = 0.5;

/** Tendência do espaço até o predecessor, comparando duas amostras. */
export function gapTrend(previousGapM: number, currentGapM: number): 'increasing' | 'decreasing' | 'stable' {
  const delta = currentGapM - previousGapM;
  if (Math.abs(delta) < SPREAD_TREND_EPSILON_M) return 'stable';
  return delta > 0 ? 'increasing' : 'decreasing';
}

/**
 * Estado observado de um personagem, nesta ordem de prioridade: chegou →
 * sem predecessor (vai na frente) → limitado pela fila agora
 * (`isLimited`, do motor) → tendência do espaço. "Limitado" tem prioridade
 * sobre a tendência porque explica PORQUE o espaço não está mudando, quando
 * os dois coincidem.
 */
export function observedState(
  walker: CharacterState,
  hasPredecessor: boolean,
  trend: 'increasing' | 'decreasing' | 'stable' | null,
): ObservedState {
  if (walker.arrivalTimeSec !== null) return 'arrived';
  if (!hasPredecessor) return 'no_predecessor';
  if (walker.isLimited) return 'limited';
  return trend ?? 'stable';
}

export const OBSERVED_STATE_LABELS: Record<ObservedState, string> = {
  arrived: 'Chegou',
  no_predecessor: 'Sem predecessor',
  limited: 'Limitado pela fila',
  increasing: 'Espaço aumentando',
  decreasing: 'Espaço diminuindo',
  stable: 'Espaço estável',
};
