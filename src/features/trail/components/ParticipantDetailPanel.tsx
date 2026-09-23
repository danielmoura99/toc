'use client';

/**
 * Detalhe do participante selecionado (canvas ou tabela) — evolução
 * pedagógica, frente 3 (§5.1). A mesma seleção vale nos dois lugares.
 */

import { X } from 'lucide-react';

import { observedState, OBSERVED_STATE_LABELS } from '../domain/observation';
import type { AttemptConfig, CharacterId, CharacterState } from '../domain/types';
import { characterLabel } from './characterLabel';
import { formatClock } from './format';
import { SpeedHistoryChart, type SpeedSample } from './SpeedHistoryChart';

interface ParticipantDetailPanelProps {
  config: AttemptConfig;
  characterId: CharacterId;
  walker: CharacterState;
  hasPredecessor: boolean;
  gapToPredecessorM: number | null;
  trend: 'increasing' | 'decreasing' | 'stable' | null;
  referenceSpeedKmh: number;
  history: SpeedSample[];
  windowSec: number;
  onClose: () => void;
  /** Presente só com fadiga ativa (§7.4) — capacidade atual sem flutuação, `referenceSpeed × fatigueFactor`. */
  currentCapacityKmh?: number;
}

export function ParticipantDetailPanel({
  config,
  characterId,
  walker,
  hasPredecessor,
  gapToPredecessorM,
  trend,
  referenceSpeedKmh,
  history,
  windowSec,
  onClose,
  currentCapacityKmh,
}: ParticipantDetailPanelProps) {
  const state = observedState(walker, hasPredecessor, trend);
  const fatigueActive = currentCapacityKmh !== undefined;

  return (
    <section aria-label={`Detalhes de ${characterLabel(config, characterId)}`} className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{characterLabel(config, characterId)}</h3>
          <p className="mt-0.5 text-sm font-medium text-primary">{OBSERVED_STATE_LABELS[state]}</p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          aria-label={`Fechar detalhes de ${characterLabel(config, characterId)}`}
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Ritmo de referência</dt>
          <dd className="font-medium tabular-nums">{referenceSpeedKmh.toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vel. disponível</dt>
          <dd className="font-medium tabular-nums">{(walker.availableSpeedMps * 3.6).toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vel. efetiva</dt>
          <dd className="font-medium tabular-nums">{(walker.actualSpeedMps * 3.6).toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Distância ao predecessor</dt>
          <dd className="font-medium tabular-nums">
            {gapToPredecessorM === null ? '—' : `${Math.round(gapToPredecessorM)} m`}
          </dd>
        </div>
        {fatigueActive && (
          <>
            <div>
              <dt className="text-muted-foreground">Reserva de energia (modelo)</dt>
              <dd className="font-medium tabular-nums">{(walker.energy * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground" title="referenceSpeed × fatigueFactor — sem a flutuação do bloco atual">
                Capacidade atual sem flutuação
              </dt>
              <dd className="font-medium tabular-nums">{currentCapacityKmh!.toFixed(1)} km/h</dd>
            </div>
          </>
        )}
      </dl>

      {walker.arrivalTimeSec !== null && (
        <p className="mt-2 text-xs text-muted-foreground">Chegou em {formatClock(walker.arrivalTimeSec)}.</p>
      )}

      <div className="mt-3 border-t pt-3">
        <SpeedHistoryChart samples={history} windowSec={windowSec} />
      </div>
    </section>
  );
}
