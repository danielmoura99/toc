/**
 * Ponte entre as stores (preparação, histórico, execução) e a persistência
 * (§9). É a única camada que decide QUANDO salvar, QUANDO restaurar e como
 * aplicar uma importação — igual ao papel do módulo equivalente da trilha,
 * independente dele.
 */

import type { ProductionLineConfig, ProductionLineState } from '../domain/types';
import { useHistoryStore } from './historyStore';
import { usePreparationStore } from './preparationStore';
import { useRunStore } from './runStore';
import {
  buildSessionPayload,
  downloadSessionPayload,
  isLocalStorageAvailable,
  loadRawSession,
  saveRawSession,
  serializeSessionPayload,
  suggestedExportFileName,
  validateSessionPayload,
  type RunResult,
  type SessionPayload,
} from '../persistence';
import type { SaveOutcome } from '../persistence/localStorageAdapter';

export type RestoreOutcome =
  | { ok: true; payload: SessionPayload }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'corrupted' | 'incompatible'; issues: string[] };

export function restoreSessionFromStorage(): RestoreOutcome {
  const loaded = loadRawSession();

  if (!loaded.ok) {
    if (loaded.reason === 'empty') return { ok: false, reason: 'empty' };
    return { ok: false, reason: 'unavailable' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reason: 'corrupted', issues: ['O conteúdo salvo não é um JSON válido.'] };
  }

  const validation = validateSessionPayload(parsedJson);
  if (!validation.ok || !validation.payload) {
    return { ok: false, reason: 'corrupted', issues: validation.issues };
  }

  return { ok: true, payload: validation.payload };
}

/** Aplica um payload já validado às stores — sempre retoma uma partida ativa pausada (§9, TG07). */
export function applySessionPayload(payload: SessionPayload): void {
  usePreparationStore.getState().restoreDraft(payload.preparation);
  useHistoryStore.getState().hydrateHistory(payload.history, payload.pendingRun);

  if (payload.activeRun) {
    useRunStore.getState().resumeRun(payload.activeRun.config, payload.activeRun.state);
  } else {
    useRunStore.getState().clearRun();
  }
}

function activeRunFromRunStore(): { config: ProductionLineConfig; state: ProductionLineState } | null {
  const { config, state } = useRunStore.getState();
  if (!config || !state || state.status === 'completed') return null;
  return { config, state };
}

export function currentSessionPayload(): SessionPayload {
  const { draft, prediction } = usePreparationStore.getState();
  const { history, pendingRun } = useHistoryStore.getState();
  return buildSessionPayload(draft, prediction, history, pendingRun, activeRunFromRunStore());
}

/** Salva a sessão corrente. Chamado após cada turno confirmado e após mudanças confirmadas na preparação (§9). */
export function saveCurrentSession(): SaveOutcome {
  if (!isLocalStorageAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }
  return saveRawSession(serializeSessionPayload(currentSessionPayload()));
}

export function exportCurrentSession(): void {
  const payload = currentSessionPayload();
  downloadSessionPayload(payload, suggestedExportFileName(payload));
}

export interface ImportSummary {
  runCount: number;
  hasActiveRun: boolean;
  hasPendingRun: boolean;
  savedAt: string;
  stageCounts: number[];
  horizons: number[];
}

export type ValidateImportOutcome =
  | { ok: true; payload: SessionPayload; summary: ImportSummary }
  | { ok: false; issues: string[] };

export function validateImportedRaw(raw: string): ValidateImportOutcome {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, issues: ['O arquivo não contém um JSON válido.'] };
  }

  const validation = validateSessionPayload(parsedJson);
  if (!validation.ok || !validation.payload) {
    return { ok: false, issues: validation.issues };
  }

  const payload = validation.payload;
  const runs: RunResult[] = payload.history;

  return {
    ok: true,
    payload,
    summary: {
      runCount: runs.length,
      hasActiveRun: payload.activeRun !== null,
      hasPendingRun: payload.pendingRun !== null,
      savedAt: payload.savedAt,
      stageCounts: [...new Set(runs.map((run) => run.config.stages.length))],
      horizons: [...new Set(runs.map((run) => run.config.rounds))],
    },
  };
}
