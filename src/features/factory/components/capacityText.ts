/**
 * Textos compartilhados da experiência "Restrição e melhoria do fluxo":
 * números em pt-BR, plural de lotes, rótulo da intervenção e a decomposição
 * da capacidade do dia (§4.3 — o dado sozinho não é a capacidade total).
 */

import { profileFor } from '../domain/capacity';
import { EXPERIENCE_LABEL } from '../domain/config';
import type { ProductionLineConfig, TurnEvent } from '../domain/types';

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits });
}

export function formatLots(value: number): string {
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? 'lote' : 'lotes'}`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${formatNumber(ratio * 100, 0)}%`;
}

export function formatSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
}

export function sectorName(config: ProductionLineConfig, stageId: string): string {
  return config.stages.find((stage) => stage.id === stageId)?.sectorName ?? stageId;
}

/** "Linha de base", "+2 em Pintura" ou o nome da experiência antiga. */
export function interventionLabel(config: ProductionLineConfig): string {
  if (config.experience !== 'constraint-flow') return EXPERIENCE_LABEL['dependency-variability'];
  if (!config.intervention) return 'Linha de base';
  return `+${config.intervention.addedCapacity} em ${sectorName(config, config.intervention.targetStageId)}`;
}

/** "Dado: 4 + capacidade adicional do setor: 2 + melhoria: 1 = capacidade disponível hoje: 7 lotes." */
export function capacityBreakdown(config: ProductionLineConfig, event: TurnEvent): string {
  const profile = profileFor(config, event.stageId);
  const parts = [`Dado: ${event.die}`, `capacidade adicional do setor: ${profile.baseBonus}`];
  if (profile.upgrade > 0) parts.push(`melhoria: ${profile.upgrade}`);
  return `${parts.join(' + ')} = capacidade disponível hoje: ${formatLots(event.availableCapacity)}.`;
}
