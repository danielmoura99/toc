import { beforeEach, describe, expect, it } from 'vitest';

import { useRunStore } from '@/features/factory/application/runStore';
import { useHistoryStore } from '@/features/factory/application/historyStore';
import { createProductionLineConfig } from '@/features/factory/domain/config';
import { createInitialState, runToEnd } from '@/features/factory/domain/engine';

const store = useRunStore;

beforeEach(() => {
  useHistoryStore.setState({ history: [], pendingRun: null });
  store.setState({ config: null, state: null, uiStatus: 'ready', playbackSpeed: 1 });
});

describe('preservação da conclusão', () => {
  it('publica o último turno com o resultado já registrado e não duplica ao receber novas ações', () => {
    const config = createProductionLineConfig({ seed: 'atomic-completion' });
    store.getState().startRun(config);
    const observed: number[] = [];
    const unsubscribe = store.subscribe(s => {
      if (s.state?.status === 'completed') observed.push(useHistoryStore.getState().history.length);
    });
    for (let i = 0; i < 10; i++) store.getState().completeDay();
    store.getState().processNextStage();
    store.getState().completeDay();
    store.getState().advanceAutoTurn();
    unsubscribe();
    expect(observed).toEqual([1]);
    expect(store.getState().completedRunId).toBe(useHistoryStore.getState().history[0].id);
  });

  it('preserva a pendente e recusa iniciar ou repetir enquanto não houver espaço', () => {
    const config = createProductionLineConfig({ seed: 'pending-protection' });
    const final = runToEnd(config);
    for (let i = 0; i < 21; i++) useHistoryStore.getState().recordRun(config, final);
    const pending = useHistoryStore.getState().pendingRun;
    expect(store.getState().startRun(config)).toBe(false);
    expect(() => useHistoryStore.getState().recordRun(config, final)).toThrow();
    expect(useHistoryStore.getState().pendingRun).toBe(pending);
    // Sessões de versões anteriores podem conter pendência e partida ativa.
    const restored = createInitialState(config);
    store.getState().resumeRun(config, restored);
    store.getState().processNextStage();
    store.getState().completeDay();
    store.getState().play();
    store.getState().advanceAutoTurn();
    expect(store.getState().state).toBe(restored);
    expect(store.getState().uiStatus).toBe('paused');
    useHistoryStore.getState().removeRun(useHistoryStore.getState().history[0].id);
    store.getState().processNextStage();
    expect(store.getState().state?.events).toHaveLength(1);
    expect(store.getState().startRun(config)).toBe(true);
  });

  it('completar dia publica cada turno para persistência, inclusive quando parte de um dia incompleto', () => {
    store.getState().startRun(createProductionLineConfig({ seed: 'every-turn' }));
    store.getState().processNextStage();
    const turns: number[] = [];
    const unsubscribe = store.subscribe(s => turns.push(s.state!.events.length));
    store.getState().completeDay();
    unsubscribe();
    expect(turns).toEqual([2, 3, 4, 5]);
  });
});

describe('startRun', () => {
  it('inicia com estado inicial do motor e uiStatus ready', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'start' });
    store.getState().startRun(config);
    expect(store.getState().uiStatus).toBe('ready');
    expect(store.getState().state).toEqual(createInitialState(config));
  });
});

describe('processNextStage', () => {
  it('executa exatamente um turno e vai para paused', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'manual' });
    store.getState().startRun(config);
    store.getState().processNextStage();
    expect(store.getState().state?.events).toHaveLength(1);
    expect(store.getState().uiStatus).toBe('paused');
  });

  it('é bloqueado enquanto uiStatus é running (ação concorrente)', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'blocked' });
    store.getState().startRun(config);
    store.getState().play();
    expect(store.getState().uiStatus).toBe('running');
    store.getState().processNextStage();
    expect(store.getState().state?.events).toHaveLength(0);
  });

  it('não faz nada depois de concluído', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'noop-after-done' });
    store.getState().startRun(config);
    // Termina a partida via completeDay repetido.
    for (let i = 0; i < config.rounds; i += 1) store.getState().completeDay();
    expect(store.getState().uiStatus).toBe('completed');
    const eventsBefore = store.getState().state?.events.length;
    store.getState().processNextStage();
    expect(store.getState().state?.events.length).toBe(eventsBefore);
  });
});

describe('advanceAutoTurn', () => {
  it('só age enquanto uiStatus já é running — o oposto de processNextStage', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'auto-guard' });
    store.getState().startRun(config);
    // Ainda 'ready': advanceAutoTurn não faz nada (só o laço de reprodução chama isto, e só existe depois de play()).
    store.getState().advanceAutoTurn();
    expect(store.getState().state?.events).toHaveLength(0);
  });

  it('executa um turno e MANTÉM uiStatus running (não rebaixa para paused)', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'auto-run' });
    store.getState().startRun(config);
    store.getState().play();
    store.getState().advanceAutoTurn();
    expect(store.getState().state?.events).toHaveLength(1);
    expect(store.getState().uiStatus).toBe('running');
    store.getState().advanceAutoTurn();
    expect(store.getState().state?.events).toHaveLength(2);
    expect(store.getState().uiStatus).toBe('running');
  });

  it('ao concluir a partida durante o automático, uiStatus vira completed', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'auto-complete' });
    store.getState().startRun(config);
    store.getState().play();
    const totalTurns = config.stages.length * config.rounds;
    for (let i = 0; i < totalTurns; i += 1) store.getState().advanceAutoTurn();
    expect(store.getState().uiStatus).toBe('completed');
    expect(store.getState().state?.status).toBe('completed');
  });

  it('depois de pause(), advanceAutoTurn para de agir (simula o intervalo sendo limpo)', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'auto-pause' });
    store.getState().startRun(config);
    store.getState().play();
    store.getState().advanceAutoTurn();
    store.getState().pause();
    expect(store.getState().uiStatus).toBe('paused');
    store.getState().advanceAutoTurn();
    expect(store.getState().state?.events).toHaveLength(1); // não avançou mais.
  });
});

describe('completeDay', () => {
  it('executa só os turnos restantes da rodada atual', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'complete-day' });
    store.getState().startRun(config);
    store.getState().processNextStage(); // 1 turno manual
    store.getState().completeDay(); // completa a rodada (mais 4 turnos)
    expect(store.getState().state?.completedRounds).toBe(1);
    expect(store.getState().state?.events).toHaveLength(5);
  });

  it('do início, executa uma rodada inteira', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'complete-day-2' });
    store.getState().startRun(config);
    store.getState().completeDay();
    expect(store.getState().state?.completedRounds).toBe(1);
    expect(store.getState().state?.events).toHaveLength(5);
  });
});

describe('play/pause', () => {
  it('play liga running; pause volta para paused', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'play-pause' });
    store.getState().startRun(config);
    store.getState().play();
    expect(store.getState().uiStatus).toBe('running');
    store.getState().pause();
    expect(store.getState().uiStatus).toBe('paused');
  });

  it('play não reativa uma partida já concluída', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'play-done' });
    store.getState().startRun(config);
    for (let i = 0; i < config.rounds; i += 1) store.getState().completeDay();
    store.getState().play();
    expect(store.getState().uiStatus).toBe('completed');
  });
});

describe('resumeRun', () => {
  it('sempre retoma pausado, mesmo que o estado salvo estivesse ativo (TG07)', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'resume' });
    let s = createInitialState(config);
    store.getState().startRun(config);
    store.getState().processNextStage();
    s = store.getState().state!;

    store.setState({ config: null, state: null, uiStatus: 'ready' }); // simula reload
    store.getState().resumeRun(config, s);

    expect(store.getState().uiStatus).toBe('paused');
    expect(store.getState().state).toEqual(s);
  });
});

describe('manual e automático produzem o mesmo resultado (TG05)', () => {
  it('completeDay repetido bate com runToEnd', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'manual-auto-parity' });
    store.getState().startRun(config);
    for (let i = 0; i < config.rounds; i += 1) store.getState().completeDay();
    expect(store.getState().state).toEqual(runToEnd(config));
  });
});
