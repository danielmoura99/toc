/**
 * Exportação para arquivo e leitura de um arquivo importado — idêntico em
 * espírito ao utilitário da trilha, mas independente (opera sobre o
 * `SessionPayload` da fábrica).
 *
 * Toca `document`/`URL`/`Blob`, portanto só faz sentido chamado a partir de um
 * Client Component, em resposta a uma ação do operador.
 */

import { IMPORT_MAX_BYTES, type SessionPayload } from './schema';

export function downloadSessionPayload(payload: SessionPayload, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

export type ReadFileOutcome =
  | { ok: true; raw: string }
  | { ok: false; reason: 'too_large' | 'read_error'; detail?: string };

export async function readSessionFile(file: File): Promise<ReadFileOutcome> {
  if (file.size > IMPORT_MAX_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      detail: `${(file.size / (1024 * 1024)).toFixed(2)} MiB — limite de ${(IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0)} MiB.`,
    };
  }

  try {
    const raw = await file.text();
    return { ok: true, raw };
  } catch (error) {
    return { ok: false, reason: 'read_error', detail: error instanceof Error ? error.message : String(error) };
  }
}

export type ParsedImport =
  | { ok: true; raw: string }
  | { ok: false; reason: 'invalid_json'; detail: string };

export function parseJsonText(raw: string): ParsedImport {
  try {
    JSON.parse(raw);
    return { ok: true, raw };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid_json',
      detail: error instanceof Error ? error.message : 'JSON malformado.',
    };
  }
}
