'use client';

/**
 * Aviso persistente enquanto há uma tentativa concluída sem espaço no
 * histórico (§12). Fica visível em qualquer tela — a tentativa sobrevive a
 * navegar para o histórico e excluir uma antiga (ela entra automaticamente),
 * mas o operador só sabe que existe uma pendência se este aviso aparecer fora
 * da tela de execução, que já foi desmontada quando ele chegar lá.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { useAttemptsStore } from '../application/attemptsStore';
import { ConfirmDialog } from './ConfirmDialog';
import { formatClock } from './format';

interface PendingAttemptBannerProps {
  onViewHistory: () => void;
}

export function PendingAttemptBanner({ onViewHistory }: PendingAttemptBannerProps) {
  const pendingAttempt = useAttemptsStore((state) => state.pendingAttempt);
  const discardPendingAttempt = useAttemptsStore((state) => state.discardPendingAttempt);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  if (!pendingAttempt) return null;

  const timeLabel =
    pendingAttempt.outcome === 'completed'
      ? `chegou em ${formatClock(pendingAttempt.totalTimeSec!)}`
      : `timeout aos ${pendingAttempt.metrics.collectiveProgressPct.toFixed(1)}% do percurso`;

  return (
    <>
      <div role="alert" className="flex gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium">
            Uma tentativa concluída ({timeLabel}) está aguardando espaço no histórico (20/20).
          </p>
          <p className="mt-1 text-xs">
            Ela não foi perdida. Exclua uma tentativa antiga para que esta entre automaticamente, ou
            descarte-a de forma explícita.
          </p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="text-xs font-medium underline" onClick={onViewHistory}>
              Ver histórico
            </button>
            <button
              type="button"
              className="text-xs font-medium underline"
              onClick={() => setShowDiscardConfirm(true)}
            >
              Descartar esta tentativa
            </button>
          </div>
        </div>
      </div>

      {showDiscardConfirm && (
        <ConfirmDialog
          title="Descartar a tentativa pendente?"
          description={`Essa tentativa (${timeLabel}) não será registrada no histórico nem incluída em exportações futuras. Esta ação não pode ser desfeita.`}
          confirmLabel="Descartar"
          onConfirm={() => {
            discardPendingAttempt();
            setShowDiscardConfirm(false);
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </>
  );
}
