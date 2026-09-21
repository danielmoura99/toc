'use client';

/**
 * Diálogo de confirmação genérico, para ações que descartam algo (§7.6:
 * "Reiniciar uma execução ativa exige confirmação de descarte do progresso").
 * Reaproveita o mesmo trap de foco do diálogo de importação — abrir, prender
 * Tab dentro, Escape cancela, foco volta a quem abriu.
 */

import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

import { useFocusTrap } from './useFocusTrap';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <h2 id="confirm-dialog-title" className="text-base font-semibold">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
