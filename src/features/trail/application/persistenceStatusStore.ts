/**
 * Estado de persistência visível na interface: se o localStorage está
 * disponível, se a última restauração falhou e por quê, se o último salvamento
 * falhou. Puramente informativo — nenhuma lógica de leitura/escrita mora aqui,
 * só a tradução de um resultado já calculado (`RestoreOutcome`/`SaveOutcome`)
 * em algo que um banner pode mostrar e o operador pode dispensar.
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
  /** Só passa a `false` depois da primeira tentativa real de salvar/restaurar. */
  localStorageAvailable: boolean;
  restoreIssue: RestoreIssue | null;
  /** Preenchido quando uma sessão salva foi recuperada com sucesso. */
  restoredAt: string | null;
  saveIssue: SaveIssue | null;
  /**
   * Havia uma execução ativa (não terminada) quando a aplicação foi montada —
   * um recarregamento a interrompeu (§7.6). Configuração e histórico
   * continuam intactos; só a execução em si não pôde ser retomada.
   */
  wasInterrupted: boolean;

  setRestoreOutcome: (outcome: RestoreOutcome) => void;
  setSaveOutcome: (outcome: SaveOutcome) => void;
  dismissRestoreIssue: () => void;
  dismissSaveIssue: () => void;
  setWasInterrupted: (value: boolean) => void;
  dismissInterruption: () => void;
}

export const usePersistenceStatusStore = create<PersistenceStatusState>((set) => ({
  localStorageAvailable: true,
  restoreIssue: null,
  restoredAt: null,
  saveIssue: null,
  wasInterrupted: false,

  setRestoreOutcome: (outcome) => {
    if (outcome.ok) {
      set({ restoreIssue: null, restoredAt: new Date().toISOString(), localStorageAvailable: true });
      return;
    }

    if (outcome.reason === 'empty') {
      // Nada salvo ainda: não é uma falha, não merece banner.
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
  setWasInterrupted: (value) => set({ wasInterrupted: value }),
  dismissInterruption: () => set({ wasInterrupted: false }),
}));
