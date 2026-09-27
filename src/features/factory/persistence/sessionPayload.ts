/**
 * Construção e leitura do payload de sessão da fábrica. Módulo puro: recebe
 * o estado já existente nas stores e devolve dados serializáveis.
 */

import type { ProductionLineConfig, ProductionLineState } from '../domain/types';
import { ENGINE_VERSION } from '../domain/types';
import {
  SCHEMA_VERSION,
  type ActiveRun,
  type PreparationSnapshot,
  type RunResult,
  type SessionPayload,
} from './schema';

export function preparationSnapshotFromDraft(config: ProductionLineConfig, prediction: number | null): PreparationSnapshot {
  return { config, prediction };
}

export function activeRunFromState(
  config: ProductionLineConfig,
  state: ProductionLineState,
): ActiveRun | null {
  if (state.status === 'completed') return null;
  return { config, state };
}

export function buildSessionPayload(
  draft: ProductionLineConfig,
  prediction: number | null,
  history: RunResult[],
  pendingRun: RunResult | null,
  activeRun: ActiveRun | null,
): SessionPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    savedAt: new Date().toISOString(),
    preparation: preparationSnapshotFromDraft(draft, prediction),
    history,
    pendingRun,
    activeRun,
  };
}

export function serializeSessionPayload(payload: SessionPayload): string {
  return JSON.stringify(payload);
}

export function suggestedExportFileName(payload: SessionPayload): string {
  const date = new Date(payload.savedAt);
  const stamp = Number.isNaN(date.getTime())
    ? 'sessao'
    : date.toISOString().slice(0, 16).replace(':', '-');
  return `fabrica-de-componentes_${stamp}.json`;
}
