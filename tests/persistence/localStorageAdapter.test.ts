import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearActiveAttemptMarker,
  clearStoredSession,
  consumeInterruptedAttemptMarker,
  isLocalStorageAvailable,
  loadRawSession,
  markAttemptActive,
  saveRawSession,
} from '@/features/trail/persistence/localStorageAdapter';
import { STORAGE_KEY } from '@/features/trail/persistence/schema';

/** localStorage falso, suficiente para exercitar o adaptador sem jsdom. */
function createFakeLocalStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    ...overrides,
  } as Storage;
}

describe('sem window (ambiente de servidor)', () => {
  it('reporta indisponível sem lançar', () => {
    expect(isLocalStorageAvailable()).toBe(false);
    expect(saveRawSession('{}')).toEqual({ ok: false, reason: 'unavailable' });
    expect(loadRawSession()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('clearStoredSession não lança sem window', () => {
    expect(() => clearStoredSession()).not.toThrow();
  });
});

describe('com localStorage utilizável', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: createFakeLocalStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detecta disponibilidade', () => {
    expect(isLocalStorageAvailable()).toBe(true);
  });

  it('reporta vazio quando nada foi salvo', () => {
    expect(loadRawSession()).toEqual({ ok: false, reason: 'empty' });
  });

  it('salva e lê de volta o mesmo conteúdo', () => {
    const raw = JSON.stringify({ hello: 'trilha' });
    expect(saveRawSession(raw)).toEqual({ ok: true });
    expect(loadRawSession()).toEqual({ ok: true, raw });
  });

  it('usa a chave versionada sugerida pelo guia', () => {
    saveRawSession('{}');
    expect((window as unknown as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY)).toBe('{}');
  });

  it('clearStoredSession remove o conteúdo salvo', () => {
    saveRawSession('{}');
    clearStoredSession();
    expect(loadRawSession()).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('quando localStorage está bloqueado (ex.: navegação privada)', () => {
  it('setItem lançando é reportado como indisponível, não propagado', () => {
    vi.stubGlobal('window', {
      localStorage: createFakeLocalStorage({
        setItem: () => {
          throw new DOMException('bloqueado', 'SecurityError');
        },
      }),
    });

    expect(isLocalStorageAvailable()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('setItem estourando cota é reportado como quota_exceeded', () => {
    vi.stubGlobal('window', {
      localStorage: createFakeLocalStorage({
        setItem: (key: string) => {
          if (key === '__trail_mvp_probe__') return; // probe de disponibilidade passa
          throw new DOMException('cota excedida', 'QuotaExceededError');
        },
      }),
    });

    expect(saveRawSession('{}')).toEqual({
      ok: false,
      reason: 'quota_exceeded',
      detail: expect.any(String),
    });
    vi.unstubAllGlobals();
  });

  it('getItem lançando não propaga a exceção', () => {
    vi.stubGlobal('window', {
      localStorage: createFakeLocalStorage({
        getItem: () => {
          throw new Error('falha inesperada');
        },
      }),
    });

    const result = loadRawSession();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown');
    vi.unstubAllGlobals();
  });
});

describe('marcador de execução ativa (§7.6 — aviso de interrupção após recarregar)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: createFakeLocalStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem marcação, consumeInterruptedAttemptMarker devolve false', () => {
    expect(consumeInterruptedAttemptMarker()).toBe(false);
  });

  it('markAttemptActive seguido de consumeInterruptedAttemptMarker devolve true', () => {
    markAttemptActive();
    expect(consumeInterruptedAttemptMarker()).toBe(true);
  });

  it('consumir o marcador o remove — uma segunda leitura devolve false', () => {
    markAttemptActive();
    expect(consumeInterruptedAttemptMarker()).toBe(true);
    expect(consumeInterruptedAttemptMarker()).toBe(false);
  });

  it('clearActiveAttemptMarker remove sem contar como interrupção', () => {
    markAttemptActive();
    clearActiveAttemptMarker();
    expect(consumeInterruptedAttemptMarker()).toBe(false);
  });

  it('sem window, nada lança e tudo se comporta como "sem marcação"', () => {
    vi.unstubAllGlobals();
    expect(() => markAttemptActive()).not.toThrow();
    expect(() => clearActiveAttemptMarker()).not.toThrow();
    expect(consumeInterruptedAttemptMarker()).toBe(false);
  });
});
