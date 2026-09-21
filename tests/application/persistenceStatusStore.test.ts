import { beforeEach, describe, expect, it } from 'vitest';

import { usePersistenceStatusStore } from '@/features/trail/application/persistenceStatusStore';

const store = usePersistenceStatusStore;

beforeEach(() => {
  store.setState({
    localStorageAvailable: true,
    restoreIssue: null,
    restoredAt: null,
    saveIssue: null,
  });
});

describe('setRestoreOutcome', () => {
  it('sucesso limpa problema e registra o horário', () => {
    store.getState().setRestoreOutcome({ ok: true, payload: {} as never });

    expect(store.getState().restoreIssue).toBeNull();
    expect(store.getState().restoredAt).toBeTruthy();
    expect(store.getState().localStorageAvailable).toBe(true);
  });

  it('"empty" não é tratado como problema', () => {
    store.getState().setRestoreOutcome({ ok: false, reason: 'empty' });
    expect(store.getState().restoreIssue).toBeNull();
  });

  it('"unavailable" marca localStorage indisponível', () => {
    store.getState().setRestoreOutcome({ ok: false, reason: 'unavailable' });

    expect(store.getState().localStorageAvailable).toBe(false);
    expect(store.getState().restoreIssue).toEqual({ reason: 'unavailable' });
  });

  it('"corrupted" preserva as mensagens de issues', () => {
    store.getState().setRestoreOutcome({
      ok: false,
      reason: 'corrupted',
      issues: ['Versão do motor incompatível.'],
    });

    expect(store.getState().restoreIssue).toEqual({
      reason: 'corrupted',
      issues: ['Versão do motor incompatível.'],
    });
  });
});

describe('setSaveOutcome', () => {
  it('sucesso limpa o problema de salvamento', () => {
    store.setState({ saveIssue: { reason: 'unknown' } });
    store.getState().setSaveOutcome({ ok: true });

    expect(store.getState().saveIssue).toBeNull();
  });

  it('quota_exceeded não derruba localStorageAvailable', () => {
    store.getState().setSaveOutcome({ ok: false, reason: 'quota_exceeded', detail: 'cheio' });

    expect(store.getState().saveIssue).toEqual({ reason: 'quota_exceeded', detail: 'cheio' });
    expect(store.getState().localStorageAvailable).toBe(true);
  });

  it('unavailable marca localStorageAvailable como falso', () => {
    store.getState().setSaveOutcome({ ok: false, reason: 'unavailable' });
    expect(store.getState().localStorageAvailable).toBe(false);
  });
});

describe('dismiss', () => {
  it('dismissRestoreIssue e dismissSaveIssue limpam só o respectivo campo', () => {
    store.setState({
      restoreIssue: { reason: 'corrupted', issues: ['x'] },
      saveIssue: { reason: 'unknown' },
    });

    store.getState().dismissRestoreIssue();
    expect(store.getState().restoreIssue).toBeNull();
    expect(store.getState().saveIssue).not.toBeNull();

    store.getState().dismissSaveIssue();
    expect(store.getState().saveIssue).toBeNull();
  });
});
