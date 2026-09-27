/**
 * Estado de persistência visível na interface — mesmo papel do equivalente
 * da trilha, independente dele.
 */

import { create } from 'zustand';

import type { RestoreOutcome } from './sessionSync';
import type { SaveOutcome } from '../persistence/localStorageAdapter';

export interface RestoreIssue {
  reason: 'unavailable' | 'corrupted';
  issues?: string[];
}

export interface SaveIssue {
  reason: 'unavailable' | 'quota_exceeded' | 'unknown';
  detail?: string;
}

interface PersistenceStatusState {
  localStorageAvailable: boolean;
  restoreIssue: RestoreIssue | null;
  restoredAt: string | null;
  saveIssue: SaveIssue | null;

  setRestoreOutcome: (outcome: RestoreOutcome) => void;
  setSaveOutcome: (outcome: SaveOutcome) => void;
  dismissRestoreIssue: () => void;
  dismissSaveIssue: () => void;
}

export const usePersistenceStatusStore = create<PersistenceStatusState>((set) => ({
  localStorageAvailable: true,
  restoreIssue: null,
  restoredAt: null,
  saveIssue: null,

  setRestoreOutcome: (outcome) => {
    if (outcome.ok) {
      set({ restoreIssue: null, restoredAt: new Date().toISOString(), localStorageAvailable: true });
      return;
    }
    if (outcome.reason === 'empty') {
      set({ restoreIssue: null });
      return;
    }
    if (outcome.reason === 'unavailable') {
      set({ localStorageAvailable: false, restoreIssue: { reason: 'unavailable' } });
      return;
    }
    set({ restoreIssue: { reason: 'corrupted', issues: outcome.issues } });
  },

  setSaveOutcome: (outcome) => {
    if (outcome.ok) {
      set({ saveIssue: null, localStorageAvailable: true });
      return;
    }
    set({
      saveIssue: { reason: outcome.reason, detail: 'detail' in outcome ? outcome.detail : undefined },
      localStorageAvailable: outcome.reason !== 'unavailable',
    });
  },

  dismissRestoreIssue: () => set({ restoreIssue: null }),
  dismissSaveIssue: () => set({ saveIssue: null }),
}));
