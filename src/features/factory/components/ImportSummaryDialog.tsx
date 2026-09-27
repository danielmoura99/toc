'use client';

/**
 * Confirmação de importação (§9): mostra o resumo antes de substituir os
 * dados locais existentes. Nada é aplicado sem essa confirmação explícita.
 */

import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

import { useFocusTrap } from '@/features/trail/components/useFocusTrap';
import { formatDateTime } from '@/features/trail/components/format';

import type { ImportSummary } from '../application/sessionSync';

interface ImportSummaryDialogProps {
  summary: ImportSummary;
  currentHistoryCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportSummaryDialog({ summary, currentHistoryCount, onConfirm, onCancel }: ImportSummaryDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="factory-import-summary-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
        <h2 id="factory-import-summary-title" className="text-base font-semibold">
          Confirmar importação
        </h2>

        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Salva em" value={formatDateTime(summary.savedAt)} />
          <Row label="Partidas" value={String(summary.runCount)} />
          <Row label="Setores" value={summary.stageCounts.join(', ') || '—'} />
          <Row label="Horizontes" value={summary.horizons.join(', ') || '—'} />
          <Row label="Partida em andamento" value={summary.hasActiveRun ? 'Sim' : 'Não'} />
        </dl>

        {currentHistoryCount > 0 && (
          <div className="mt-3 flex gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Isto substitui as <strong>{currentHistoryCount}</strong> partidas e a preparação que estão no
              navegador agora. Essa ação não pode ser desfeita.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            onClick={onConfirm}
          >
            Substituir sessão
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
