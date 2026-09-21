/**
 * Adaptador de localStorage, isolado para o resto da aplicação nunca tocar
 * `window.localStorage` diretamente.
 *
 * Acessa `localStorage` apenas no cliente (§10.3) e nunca deixa uma exceção de
 * armazenamento (indisponível, cheio, bloqueado por navegação privada)
 * escapar: toda falha vira um resultado tipado que a UI decide como mostrar.
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

/** Testa se o localStorage está de fato utilizável, não só presente. */
export function isLocalStorageAvailable(): boolean {
  if (!isBrowser()) return false;

  try {
    const probeKey = '__trail_mvp_probe__';
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
    // DOMException 22 (Firefox) / QUOTA_EXCEEDED_ERR (nomes variam por navegador).
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
    // Nada a fazer: se remover falha, a próxima leitura falha do mesmo jeito
    // e a aplicação já sabe reagir a isso.
  }
}

/**
 * Marcador separado do payload da sessão: existe só enquanto uma execução
 * está ativa (running/paused/ready — não terminada), para que um recarregamento
 * nesse meio-tempo possa ser informado ao operador (§7.6: "Recarregar a página
 * não promete retomar uma execução em andamento: preservar configuração e
 * histórico e informar a interrupção"). Não é parte do payload de sessão
 * porque não é dado — é só um sinal transitório de "havia algo em andamento".
 */
const ACTIVE_ATTEMPT_KEY = 'trail-mvp:active-attempt';

export function markAttemptActive(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACTIVE_ATTEMPT_KEY, '1');
  } catch {
    // Sem localStorage utilizável, não há como detectar a interrupção depois
    // — mas o aviso do §12 sobre indisponibilidade de armazenamento já cobre
    // esse caso separadamente.
  }
}

export function clearActiveAttemptMarker(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
  } catch {
    // Idem: falha silenciosa e inofensiva aqui.
  }
}

/**
 * Lê o marcador e já o remove — uma leitura só conta uma vez, para não repetir
 * o aviso em recarregamentos seguintes que não tiveram nova interrupção.
 */
export function consumeInterruptedAttemptMarker(): boolean {
  if (!isBrowser()) return false;

  try {
    const wasActive = window.localStorage.getItem(ACTIVE_ATTEMPT_KEY) !== null;
    if (wasActive) window.localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
    return wasActive;
  } catch {
    return false;
  }
}
