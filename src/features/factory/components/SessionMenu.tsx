'use client';

/**
 * Exportar/importar sessão da fábrica em JSON (§9). Importar nunca aplica
 * direto: lê o arquivo, valida, mostra um resumo e só substitui a sessão
 * corrente com confirmação explícita do operador.
 */

import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';

import {
  applySessionPayload,
  exportCurrentSession,
  saveCurrentSession,
  validateImportedRaw,
  type ImportSummary,
} from '../application/sessionSync';
import { useHistoryStore } from '../application/historyStore';
import { usePersistenceStatusStore } from '../application/persistenceStatusStore';
import { parseJsonText, readSessionFile } from '../persistence/importExport';
import type { SessionPayload } from '../persistence/schema';
import { ImportSummaryDialog } from './ImportSummaryDialog';

interface PendingImport {
  payload: SessionPayload;
  summary: ImportSummary;
}

export function SessionMenu() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string[] | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const historyCount = useHistoryStore((state) => state.history.length);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportError(null);

    const read = await readSessionFile(file);
    if (!read.ok) {
      setImportError(
        read.reason === 'too_large'
          ? [`Arquivo grande demais (${read.detail}).`]
          : [`Não foi possível ler o arquivo. ${read.detail ?? ''}`],
      );
      return;
    }

    const parsed = parseJsonText(read.raw);
    if (!parsed.ok) {
      setImportError([`Arquivo corrompido: ${parsed.detail}`]);
      return;
    }

    const validated = validateImportedRaw(parsed.raw);
    if (!validated.ok) {
      setImportError(validated.issues);
      return;
    }

    setPendingImport({ payload: validated.payload, summary: validated.summary });
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    applySessionPayload(pendingImport.payload);
    const outcome = saveCurrentSession();
    usePersistenceStatusStore.getState().setSaveOutcome(outcome);
    setPendingImport(null);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        onClick={() => exportCurrentSession()}
      >
        <Download className="size-4" aria-hidden="true" />
        Exportar
      </button>

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden="true" />
        Importar
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="sr-only"
        aria-label="Selecionar arquivo de sessão da fábrica para importar"
        onChange={handleFileChange}
      />

      {importError && (
        <div
          role="alert"
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm shadow-lg"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Não foi possível importar</p>
            <ul className="mt-1 list-inside list-disc text-xs">
              {importError.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">A sessão atual não foi alterada.</p>
          </div>
          <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => setImportError(null)}>
            Fechar
          </button>
        </div>
      )}

      {pendingImport && (
        <ImportSummaryDialog
          summary={pendingImport.summary}
          currentHistoryCount={historyCount}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
