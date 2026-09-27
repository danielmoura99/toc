import { beforeEach, describe, expect, it } from 'vitest';

import { useHistoryStore } from '@/features/factory/application/historyStore';
import { usePreparationStore } from '@/features/factory/application/preparationStore';
import { useRunStore } from '@/features/factory/application/runStore';
import { applySessionPayload, currentSessionPayload, validateImportedRaw } from '@/features/factory/application/sessionSync';
import { createProductionLineConfig } from '@/features/factory/domain/config';
import { runToEnd } from '@/features/factory/domain/engine';
import { serializeSessionPayload } from '@/features/factory/persistence';

beforeEach(() => {
  usePreparationStore.setState({ draft: createProductionLineConfig({ seed: 'sync-seed' }), prediction: 30 });
  useHistoryStore.setState({ history: [], selectedForComparison: [], pendingRun: null });
  useRunStore.setState({ config: null, state: null, uiStatus: 'ready', playbackSpeed: 1 });
});

describe('currentSessionPayload / applySessionPayload — roundtrip', () => {
  it('reconstrói preparação e histórico a partir do payload atual', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'history-run' });
    useHistoryStore.getState().recordRun(config, runToEnd(config));

    const payload = currentSessionPayload();
    expect(payload.preparation.prediction).toBe(30);
    expect(payload.history).toHaveLength(1);
    expect(payload.activeRun).toBeNull();

    usePreparationStore.setState({ draft: createProductionLineConfig({ seed: 'other' }), prediction: null });
    useHistoryStore.setState({ history: [], selectedForComparison: [], pendingRun: null });

    applySessionPayload(payload);
    expect(usePreparationStore.getState().prediction).toBe(30);
    expect(useHistoryStore.getState().history).toHaveLength(1);
  });

  it('inclui uma partida ativa e a restaura sempre pausada ao aplicar (TG07)', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'active-sync' });
    useRunStore.getState().startRun(config);
    useRunStore.getState().processNextStage();

    const payload = currentSessionPayload();
    expect(payload.activeRun).not.toBeNull();
    expect(payload.activeRun?.state.events).toHaveLength(1);

    useRunStore.setState({ config: null, state: null, uiStatus: 'ready' });
    applySessionPayload(payload);

    expect(useRunStore.getState().uiStatus).toBe('paused');
    expect(useRunStore.getState().state?.events).toHaveLength(1);
  });

  it('não inclui activeRun quando a partida já foi concluída (foi para o histórico via recordRun, não fica solta em runStore)', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'completed-sync' });
    useRunStore.getState().startRun(config);
    for (let i = 0; i < config.rounds; i += 1) useRunStore.getState().completeDay();
    expect(useRunStore.getState().state?.status).toBe('completed');

    const payload = currentSessionPayload();
    expect(payload.activeRun).toBeNull();
  });
});

describe('validateImportedRaw', () => {
  it('aceita um payload serializado válido e resume seu conteúdo', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'import-run' });
    useHistoryStore.getState().recordRun(config, runToEnd(config));
    const raw = serializeSessionPayload(currentSessionPayload());

    const result = validateImportedRaw(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.runCount).toBe(1);
    expect(result.summary.hasActiveRun).toBe(false);
  });

  it('rejeita JSON malformado sem alterar nada', () => {
    const result = validateImportedRaw('{ isso não é json');
    expect(result.ok).toBe(false);
  });
});
