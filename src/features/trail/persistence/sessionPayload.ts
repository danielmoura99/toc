/**
 * Construção e leitura do payload de sessão.
 *
 * Este módulo é puro: recebe o estado já existente nas stores (preparação e
 * histórico) e devolve dados serializáveis, ou o caminho inverso. Não conhece
 * localStorage nem `<input type="file">` — isso é responsabilidade dos módulos
 * vizinhos (`localStorageAdapter`, `importExport`).
 */

import { ENGINE_VERSION } from '../domain/types';
import type { AttemptConfig, AttemptResult } from '../domain/types';
import { SCHEMA_VERSION, type PreparationSnapshot, type SessionPayload } from './schema';

export function preparationSnapshotFromDraft(draft: AttemptConfig): PreparationSnapshot {
  return {
    scenario: draft.scenario,
    guidedStage: draft.guidedStage,
    seed: draft.seed,
    order: [...draft.order],
    ownerByItem: { ...draft.ownerByItem },
    participantByCharacter: { ...draft.participantByCharacter },
    hypothesis: draft.hypothesis,
  };
}

export function buildSessionPayload(
  draft: AttemptConfig,
  history: AttemptResult[],
  referenceAttemptId: string | null,
  pendingAttempt: AttemptResult | null = null,
): SessionPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    savedAt: new Date().toISOString(),
    preparation: preparationSnapshotFromDraft(draft),
    history,
    referenceAttemptId,
    pendingAttempt,
  };
}

export function serializeSessionPayload(payload: SessionPayload): string {
  return JSON.stringify(payload);
}

/** Nome de arquivo legível para exportação, com data e hora. */
export function suggestedExportFileName(payload: SessionPayload): string {
  const date = new Date(payload.savedAt);
  const stamp = Number.isNaN(date.getTime())
    ? 'sessao'
    : date.toISOString().slice(0, 16).replace(':', '-');
  return `simulador-da-trilha_${stamp}.json`;
}
