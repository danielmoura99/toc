/**
 * Adaptador de localStorage da Fábrica de componentes — isolado do resto da
 * aplicação, e da persistência da trilha (chave própria, TG12).
 *
 * Nunca deixa uma exceção de armazenamento (indisponível, cheio, bloqueado
 * por navegação privada) escapar: toda falha vira um resultado tipado que a
 * UI decide como mostrar.
 */

import { STORAGE_KEY } from './schema';

export type SaveOutcome =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'quota_exceeded' | 'unknown'; detail?: string };

export type LoadOutcome =
  | { ok: true; raw: string }
  | { ok: false; reason: 'empty' | 'unavailable' | 'unknown'; detail?: string };

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function isLocalStorageAvailable(): boolean {
  if (!isBrowser()) return false;

  try {
    const probeKey = '__factory_mvp_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function saveRawSession(raw: string): SaveOutcome {
  if (!isBrowser()) return { ok: false, reason: 'unavailable' };

  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    return { ok: true };
  } catch (error) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    return {
      ok: false,
      reason: isQuotaError ? 'quota_exceeded' : 'unknown',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function loadRawSession(): LoadOutcome {
  if (!isBrowser()) return { ok: false, reason: 'unavailable' };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ok: false, reason: 'empty' };
    return { ok: true, raw };
  } catch (error) {
    return { ok: false, reason: 'unknown', detail: error instanceof Error ? error.message : String(error) };
  }
}

export function clearStoredSession(): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada a fazer: se remover falha, a próxima leitura falha do mesmo jeito.
  }
}
