/**
 * Eventos de diagnóstico dinâmico durante uma execução com fadiga ativa —
 * evolução pedagógica, frente 5 (§7.4).
 *
 * Recomputa do zero, reexecutando o motor: determinístico, então nunca
 * precisa ser persistido por tick — "durante reprodução, os eventos podem
 * ser recalculados deterministicamente". Só conta uma mudança de candidata
 * quando o novo conjunto se sustenta por 30 s simulados consecutivos, para
 * não alertar a cada oscilação; chegada é identificada à parte, nunca como
 * migração por fadiga — ela também reinicia a base de comparação, porque só
 * faz sentido comparar candidatas dentro do mesmo conjunto de participantes
 * ainda ativos.
 */

import { diagnoseCurrentCapacity, sameCandidateSet } from './diagnosis';
import { createInitialState, step } from './engine';
import type { AttemptConfig, CharacterId } from './types';

/** Intervalo mínimo, em segundos simulados, para uma mudança de candidata contar como sustentada (§7.4). */
export const SUSTAINED_CHANGE_WINDOW_SEC = 30;

/** Teto de eventos guardados por tentativa (§7.4: "limitar o registro a 100 eventos"). */
export const MAX_FATIGUE_DIAGNOSIS_EVENTS = 100;

export type FatigueDiagnosisEventKind = 'arrival' | 'candidate_change';

export interface FatigueDiagnosisEvent {
  atSec: number;
  kind: FatigueDiagnosisEventKind;
  /** Presente só em eventos de chegada. */
  characterId?: CharacterId;
  /** Presentes só em mudanças de candidata sustentadas. */
  candidateIdsBefore?: CharacterId[];
  candidateIdsAfter?: CharacterId[];
}

export interface FatigueDiagnosisEventsResult {
  events: FatigueDiagnosisEvent[];
  truncated: boolean;
}

export function computeFatigueDiagnosisEvents(
  config: AttemptConfig,
  maxEvents = MAX_FATIGUE_DIAGNOSIS_EVENTS,
): FatigueDiagnosisEventsResult {
  const events: FatigueDiagnosisEvent[] = [];
  let truncated = false;

  const pushEvent = (event: FatigueDiagnosisEvent) => {
    if (events.length >= maxEvents) {
      truncated = true;
      return;
    }
    events.push(event);
  };

  let state = createInitialState(config);
  let confirmedActiveIds: CharacterId[] | null = null;
  let confirmedCandidates: CharacterId[] | null = null;
  let pendingCandidates: CharacterId[] | null = null;
  let pendingSinceSec: number | null = null;

  while (state.status === 'running') {
    state = step(config, state);

    const { activeIds, candidateIds } = diagnoseCurrentCapacity(config, state.characters);

    if (confirmedActiveIds && !sameCandidateSet(activeIds, confirmedActiveIds)) {
      const arrivedNow = confirmedActiveIds.filter((id) => !activeIds.includes(id));
      for (const characterId of arrivedNow) {
        pushEvent({ atSec: state.elapsedSec, kind: 'arrival', characterId });
      }
    }

    if (activeIds.length === 0) break;

    if (confirmedActiveIds === null || !sameCandidateSet(activeIds, confirmedActiveIds)) {
      // Conjunto de ativos mudou (alguém chegou): reinicia a base de
      // comparação a partir de agora, sem contar isso como migração.
      confirmedActiveIds = activeIds;
      confirmedCandidates = candidateIds;
      pendingCandidates = null;
      pendingSinceSec = null;
      continue;
    }

    if (sameCandidateSet(candidateIds, confirmedCandidates!)) {
      pendingCandidates = null;
      pendingSinceSec = null;
      continue;
    }

    if (pendingCandidates && sameCandidateSet(pendingCandidates, candidateIds)) {
      if (pendingSinceSec !== null && state.elapsedSec - pendingSinceSec >= SUSTAINED_CHANGE_WINDOW_SEC) {
        pushEvent({
          atSec: pendingSinceSec,
          kind: 'candidate_change',
          candidateIdsBefore: confirmedCandidates!,
          candidateIdsAfter: pendingCandidates,
        });
        confirmedCandidates = pendingCandidates;
        pendingCandidates = null;
        pendingSinceSec = null;
      }
    } else {
      pendingCandidates = candidateIds;
      pendingSinceSec = state.elapsedSec;
    }
  }

  return { events, truncated };
}
