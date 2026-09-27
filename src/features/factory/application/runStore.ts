/**
 * Controlador de execução: turno a turno, rodada a rodada, ou automático
 * (guia §6). Ao contrário do laço contínuo de física da trilha (60 fps, por
 * isso isolado numa ref), aqui cada turno é uma transação discreta e pouco
 * frequente (no máximo alguns por segundo em reprodução automática) — uma
 * store comum já é rápida o bastante, sem custo de re-render perceptível.
 *
 * Um turno é atômico: sortear, calcular, atualizar estado e log de uma vez
 * (§6). `processNextStage`/`completeDay` (ações MANUAIS) recusam agir
 * enquanto `uiStatus` é `running`, bloqueando ações concorrentes com o
 * automático. O automático usa `advanceAutoTurn`, uma ação separada que exige
 * exatamente o oposto — só age enquanto `uiStatus` JÁ é `running` — e mantém
 * `running` depois de cada turno (não rebaixa para `paused`), para o próprio
 * intervalo de reprodução continuar chamando-a sem downgrade prematuro.
 */

import { create } from 'zustand';
import { useHistoryStore } from './historyStore';

import { createInitialState, stepTurn } from '../domain/engine';
import type { ProductionLineConfig, ProductionLineState } from '../domain/types';

export type RunUiStatus = 'ready' | 'running' | 'paused' | 'completed';
export type PlaybackSpeed = 0.5 | 1 | 2;

interface RunStoreState {
  config: ProductionLineConfig | null;
  state: ProductionLineState | null;
  uiStatus: RunUiStatus;
  playbackSpeed: PlaybackSpeed;
  completedRunId: string | null;

  /** Começa uma partida nova a partir de uma configuração congelada (snapshot, não o rascunho vivo). */
  startRun: (config: ProductionLineConfig) => boolean;
  /** Recupera uma partida em andamento salva — sempre retoma pausada, sem repetir o último turno (§9, TG07). */
  resumeRun: (config: ProductionLineConfig, state: ProductionLineState) => void;
  processNextStage: () => void;
  completeDay: () => void;
  /** Um turno chamado pelo próprio laço de reprodução automática — ver nota acima. */
  advanceAutoTurn: () => void;
  play: () => void;
  pause: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  /** Limpa a partida atual do controlador (depois de registrada, ou abandonada com confirmação). */
  clearRun: () => void;
}

function statusAfter(state: ProductionLineState): RunUiStatus {
  return state.status === 'completed' ? 'completed' : 'paused';
}

// Registra antes de publicar o estado terminal: a assinatura de persistência
// vê conclusão e resultado juntos, sem depender de montagem ou efeitos React.
function completion(config: ProductionLineConfig, state: ProductionLineState) {
  return state.status === 'completed'
    ? { completedRunId: useHistoryStore.getState().recordRun(config, state).run.id }
    : {};
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  config: null,
  state: null,
  uiStatus: 'ready',
  playbackSpeed: 1,
  completedRunId: null,

  startRun: (config) => {
    if (useHistoryStore.getState().pendingRun) return false;
    const snapshot = structuredClone(config);
    set({ config: snapshot, state: createInitialState(snapshot), uiStatus: 'ready', completedRunId: null });
    return true;
  },

  resumeRun: (config, state) => set({ config, state, uiStatus: 'paused', completedRunId: null }),

  processNextStage: () => {
    if (useHistoryStore.getState().pendingRun) return;
    const { config, state, uiStatus } = get();
    if (!config || !state || uiStatus === 'running' || state.status === 'completed') return;
    const next = stepTurn(config, state);
    set({ ...completion(config, next), state: next, uiStatus: statusAfter(next) });
  },

  completeDay: () => {
    if (useHistoryStore.getState().pendingRun) return;
    const { config, state, uiStatus } = get();
    if (!config || !state || uiStatus === 'running' || state.status === 'completed') return;

    const remainingTurnsInRound = config.stages.length - state.nextStageIndex;
    let next = state;
    for (let i = 0; i < remainingTurnsInRound && next.status === 'active'; i += 1) {
      next = stepTurn(config, next);
      set({ ...completion(config, next), state: next, uiStatus: statusAfter(next) });
    }
  },

  advanceAutoTurn: () => {
    if (useHistoryStore.getState().pendingRun) return;
    const { config, state, uiStatus } = get();
    if (!config || !state || uiStatus !== 'running' || state.status === 'completed') return;
    const next = stepTurn(config, state);
    set({ ...completion(config, next), state: next, uiStatus: next.status === 'completed' ? 'completed' : 'running' });
  },

  play: () => {
    if (useHistoryStore.getState().pendingRun) return;
    const { state } = get();
    if (state?.status === 'completed') return;
    set({ uiStatus: 'running' });
  },

  pause: () => {
    if (get().uiStatus === 'running') set({ uiStatus: 'paused' });
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  clearRun: () => set({ config: null, state: null, uiStatus: 'ready', completedRunId: null }),
}));
