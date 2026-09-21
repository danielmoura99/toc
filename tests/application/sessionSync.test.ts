import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAttemptsStore } from '@/features/trail/application/attemptsStore';
import { usePreparationStore } from '@/features/trail/application/preparationStore';
import { itemsOwnedBy } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import {
  applySessionPayload,
  currentSessionPayload,
  exportCurrentSession,
  restoreSessionFromStorage,
  reuseAttemptConfig,
  saveCurrentSession,
  validateImportedRaw,
} from '@/features/trail/application/sessionSync';
import { ENGINE_VERSION } from '@/features/trail/domain/types';
import { downloadSessionPayload } from '@/features/trail/persistence/importExport';
import { STORAGE_KEY } from '@/features/trail/persistence/schema';

function createFakeLocalStorage(): Storage {
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
  } as Storage;
}

function resetStores() {
  usePreparationStore.getState().setStage(1);
  usePreparationStore.getState().resetDraft();
  useAttemptsStore.setState({
    history: [],
    referenceAttemptId: null,
    selectedForComparison: [],
    pendingAttempt: null,
  });
}

vi.mock('@/features/trail/persistence/importExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/trail/persistence/importExport')>();
  return { ...actual, downloadSessionPayload: vi.fn() };
});

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: createFakeLocalStorage() });
  resetStores();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('currentSessionPayload / saveCurrentSession', () => {
  it('monta o payload a partir do estado atual das stores', () => {
    usePreparationStore.getState().setHypothesis('Aliviar o gargalo deve ajudar.');
    const payload = currentSessionPayload();

    expect(payload.engineVersion).toBe(ENGINE_VERSION);
    expect(payload.preparation.hypothesis).toBe('Aliviar o gargalo deve ajudar.');
    expect(payload.history).toEqual([]);
  });

  it('salva no localStorage e o conteúdo é recuperável', () => {
    const outcome = saveCurrentSession();
    expect(outcome).toEqual({ ok: true });

    const raw = (window as unknown as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).schemaVersion).toBe(2);
  });

  it('reporta indisponibilidade sem lançar quando não há window', () => {
    vi.unstubAllGlobals();
    expect(saveCurrentSession()).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('window', { localStorage: createFakeLocalStorage() });
  });
});

describe('fluxo completo: preparar → concluir → recarregar → recuperar (§13.2)', () => {
  it('restaura preparação e histórico após um "recarregamento" simulado', () => {
    // Preparar.
    usePreparationStore.getState().setStage(3);
    const draft = usePreparationStore.getState().draft;
    const moved = itemsOwnedBy(draft, 'p5').slice(0, 6);
    usePreparationStore.getState().moveItems(moved, 'p3');
    usePreparationStore.getState().setHypothesis('Redistribuir ajuda.');

    // Registrar uma tentativa concluída via fluxo real do motor.
    const attemptConfig = usePreparationStore.getState().draft;
    const finalState = runToEnd(attemptConfig);
    const recorded = useAttemptsStore.getState().recordAttempt(attemptConfig, finalState);
    expect(recorded.ok).toBe(true);

    // Salvar (aconteceria ao concluir a execução).
    expect(saveCurrentSession()).toEqual({ ok: true });

    // "Recarregar a página": stores voltam ao estado inicial.
    resetStores();
    expect(useAttemptsStore.getState().history).toHaveLength(0);
    expect(usePreparationStore.getState().draft.hypothesis).toBe('');

    // Recuperar histórico.
    const restored = restoreSessionFromStorage();
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    applySessionPayload(restored.payload);

    expect(useAttemptsStore.getState().history).toHaveLength(1);
    expect(usePreparationStore.getState().draft.hypothesis).toBe('Redistribuir ajuda.');
    expect(usePreparationStore.getState().stage).toBe(3);
    if (!recorded.ok) return;
    expect(useAttemptsStore.getState().referenceAttemptId).toBe(recorded.becameReference ? recorded.attempt.id : null);
  });

  it('uma tentativa pendente (histórico cheio) sobrevive a salvar e recarregar', () => {
    // Enche o histórico e força a próxima gravação a ficar pendente.
    for (let i = 0; i < 20; i += 1) {
      usePreparationStore.getState().setStage(1);
      const config = { ...usePreparationStore.getState().draft, seed: `seed-${i}` };
      useAttemptsStore.getState().recordAttempt(config, runToEnd(config));
    }

    const overflowConfig = { ...usePreparationStore.getState().draft, seed: 'seed-pendente' };
    const overflow = useAttemptsStore.getState().recordAttempt(overflowConfig, runToEnd(overflowConfig));
    expect(overflow.ok).toBe(false);
    expect(useAttemptsStore.getState().pendingAttempt).not.toBeNull();

    expect(saveCurrentSession()).toEqual({ ok: true });
    resetStores();
    expect(useAttemptsStore.getState().pendingAttempt).toBeNull();

    const restored = restoreSessionFromStorage();
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    applySessionPayload(restored.payload);

    // Histórico ainda cheio (20), então a pendente continua pendente — não se
    // perdeu, e também não estourou o limite de 20 ao ser restaurada.
    expect(useAttemptsStore.getState().history).toHaveLength(20);
    expect(useAttemptsStore.getState().pendingAttempt?.config.seed).toBe('seed-pendente');
  });
});

describe('restoreSessionFromStorage — casos sem sucesso', () => {
  it('reporta "empty" quando não há nada salvo', () => {
    expect(restoreSessionFromStorage()).toEqual({ ok: false, reason: 'empty' });
  });

  it('AC10 — falha de persistência é comunicada, não lançada', () => {
    vi.unstubAllGlobals();
    expect(restoreSessionFromStorage()).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('window', { localStorage: createFakeLocalStorage() });
  });

  it('payload corrompido (JSON inválido) é rejeitado com mensagem clara', () => {
    (window as unknown as { localStorage: Storage }).localStorage.setItem(STORAGE_KEY, '{ nao é json');

    const result = restoreSessionFromStorage();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupted');
  });

  it('payload de versão de motor incompatível é rejeitado sem apagar nada', () => {
    const payload = currentSessionPayload();
    (window as unknown as { localStorage: Storage }).localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, engineVersion: '0.0.1' }),
    );

    const result = restoreSessionFromStorage();
    expect(result.ok).toBe(false);
    if (result.ok || result.reason === 'empty' || result.reason === 'unavailable') {
      throw new Error('resultado inesperado');
    }
    expect(result.reason).toBe('corrupted');
    expect(result.issues.join(' ')).toContain('0.0.1');

    // O conteúdo bruto continua lá — rejeitar não apaga o que estava salvo.
    expect(
      (window as unknown as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY),
    ).toBeTruthy();
  });
});

describe('validateImportedRaw — resumo antes de aplicar', () => {
  it('não aplica nada sozinho: só valida e resume', () => {
    usePreparationStore.getState().setHypothesis('não deveria mudar');
    const payload = currentSessionPayload();

    const result = validateImportedRaw(JSON.stringify(payload));
    expect(result.ok).toBe(true);

    // A preparação corrente não foi tocada por validar.
    expect(usePreparationStore.getState().draft.hypothesis).toBe('não deveria mudar');
  });

  it('resume corretamente concluídas e timeouts', () => {
    usePreparationStore.getState().setStage(1);
    const config = usePreparationStore.getState().draft;
    const recorded = useAttemptsStore.getState().recordAttempt(config, runToEnd(config));
    expect(recorded.ok).toBe(true);

    const payload = currentSessionPayload();
    const result = validateImportedRaw(JSON.stringify(payload));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.attemptCount).toBe(1);
    expect(result.summary.completedCount + result.summary.timedOutCount).toBe(1);
    expect(result.summary.scenarioIds).toContain('trilha-a');
  });

  it('rejeita JSON malformado com mensagem, sem lançar', () => {
    const result = validateImportedRaw('{ isso não é json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('aplicar depois de validar substitui a sessão corrente', () => {
    usePreparationStore.getState().setHypothesis('sessão antiga');
    const importedPayload = currentSessionPayload();

    resetStores();
    usePreparationStore.getState().setHypothesis('sessão que será substituída');

    const validated = validateImportedRaw(JSON.stringify(importedPayload));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    applySessionPayload(validated.payload);
    expect(usePreparationStore.getState().draft.hypothesis).toBe('sessão antiga');
  });
});

describe('validateImportedRaw — permissões de etapa na preparação salva', () => {
  it('rejeita preparação de etapa 1 com mochilas redistribuídas', () => {
    // Monta a payload manipulando o ownerByItem por fora da store — é
    // exatamente o caminho que contornaria o `disabled` da UI e o guard da
    // própria store, chegando direto num JSON importado.
    usePreparationStore.getState().setStage(1);
    const draft = usePreparationStore.getState().draft;
    const moved = itemsOwnedBy(draft, 'p5').slice(0, 6);

    const payload = currentSessionPayload();
    payload.preparation.ownerByItem = { ...draft.ownerByItem };
    for (const itemId of moved) payload.preparation.ownerByItem[itemId] = 'p3';

    const result = validateImportedRaw(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.includes('preserva as cargas'))).toBe(true);
  });

  it('rejeita preparação de etapa 2 com mochilas redistribuídas', () => {
    usePreparationStore.getState().setStage(2);
    const draft = usePreparationStore.getState().draft;
    const moved = itemsOwnedBy(draft, 'p5').slice(0, 3);

    const payload = currentSessionPayload();
    payload.preparation.ownerByItem = { ...draft.ownerByItem };
    for (const itemId of moved) payload.preparation.ownerByItem[itemId] = 'p1';

    const result = validateImportedRaw(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });

  it('aceita preparação de etapa 3 com mochilas redistribuídas (permitido nessa etapa)', () => {
    usePreparationStore.getState().setStage(3);
    const draft = usePreparationStore.getState().draft;
    const moved = itemsOwnedBy(draft, 'p5').slice(0, 6);

    const payload = currentSessionPayload();
    payload.preparation.ownerByItem = { ...draft.ownerByItem };
    for (const itemId of moved) payload.preparation.ownerByItem[itemId] = 'p3';

    const result = validateImportedRaw(JSON.stringify(payload));
    expect(result.ok).toBe(true);
  });

  it('preparação de etapa 1 com as cargas iniciais (sem alteração) continua válida', () => {
    usePreparationStore.getState().setStage(1);
    const payload = currentSessionPayload();

    expect(validateImportedRaw(JSON.stringify(payload)).ok).toBe(true);
  });
});

describe('exportCurrentSession', () => {
  it('dispara o download com o payload corrente', () => {
    usePreparationStore.getState().setHypothesis('para exportar');
    exportCurrentSession();

    expect(downloadSessionPayload).toHaveBeenCalledTimes(1);
    const [payload, fileName] = vi.mocked(downloadSessionPayload).mock.calls[0];
    expect(payload.preparation.hypothesis).toBe('para exportar');
    expect(fileName).toMatch(/\.json$/);
  });
});

describe('reuseAttemptConfig', () => {
  it('aplica a ordem e as mochilas da tentativa na preparação', () => {
    usePreparationStore.getState().setStage(3);
    const moved = itemsOwnedBy(usePreparationStore.getState().draft, 'p5').slice(0, 6);
    usePreparationStore.getState().moveItems(moved, 'p3');
    usePreparationStore.getState().setOrder(['p5', 'p1', 'p2', 'p3', 'p4', 'p6']);
    const config = usePreparationStore.getState().draft;
    const recorded = useAttemptsStore.getState().recordAttempt(config, runToEnd(config));
    if (!recorded.ok) throw new Error('gravação deveria ter sucesso');

    resetStores();
    expect(usePreparationStore.getState().draft.order).not.toEqual(config.order);

    const result = reuseAttemptConfig(recorded.attempt);
    expect(result.ok).toBe(true);

    expect(usePreparationStore.getState().stage).toBe(3);
    expect(usePreparationStore.getState().draft.order).toEqual(['p5', 'p1', 'p2', 'p3', 'p4', 'p6']);
    expect(usePreparationStore.getState().draft.ownerByItem).toEqual(config.ownerByItem);
  });

  it('não aplica nada quando a tentativa viola a permissão da etapa (defesa em profundidade)', () => {
    // Não deveria ser alcançável pela UI normal, mas cobre o caminho de
    // segurança: uma tentativa gravada com redistribuição numa etapa que não
    // permite redistribuir não deve poder ser "reaproveitada" para violar a
    // mesma regra por outra porta.
    usePreparationStore.getState().setStage(1);
    const config = structuredClone(usePreparationStore.getState().draft);
    const [firstItem] = Object.keys(config.ownerByItem);
    config.ownerByItem[firstItem] = 'p6';

    const fakeAttempt = {
      id: 'fake',
      createdAt: new Date().toISOString(),
      config,
      outcome: 'completed' as const,
      finalState: runToEnd(config),
      totalTimeSec: 1,
      meanSpreadM: 0,
      metrics: {} as never,
    };

    const before = usePreparationStore.getState().draft;
    const result = reuseAttemptConfig(fakeAttempt);

    expect(result.ok).toBe(false);
    expect(usePreparationStore.getState().draft).toBe(before);
  });
});
