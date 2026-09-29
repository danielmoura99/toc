'use client';

/**
 * Tela de execução da linha de produção (guia §6, §7).
 *
 * Um turno é uma transação atômica (§6): as ações manuais recusam agir
 * enquanto `uiStatus` é `running` (bloqueado na própria store,
 * `runStore.ts`) — o mesmo padrão de duas camadas do resto do projeto (UI
 * desabilita, a store garante).
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, History, Pause, Play, SkipForward } from 'lucide-react';

import { useHistoryStore } from '../application/historyStore';
import { usePreparationStore } from '../application/preparationStore';
import { useRunStore, type PlaybackSpeed } from '../application/runStore';
import { nextTurnDescriptor } from '../domain/engine';
import { summarize, hadInsufficientMaterial } from '../domain/metrics';
import { withNewSeed } from '../domain/config';
import type { ProductionLineConfig } from '../domain/types';
import { ConfirmDialog } from '@/features/trail/components/ConfirmDialog';
import { StageTable } from './StageTable';
import { RunObservations } from './RunObservations';
import { PendingRunNotice } from './PendingRunNotice';
import { stageLabel } from './stageLabel';
import { ConstraintFlowPanel } from './ConstraintFlowPanel';
import { capacityBreakdown, formatLots, interventionLabel } from './capacityText';

const FactoryPixiCanvas = dynamic(() => import('./FactoryPixiCanvas').then((m) => m.FactoryPixiCanvas), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded-lg border bg-card" />,
});

const SPEED_LABELS: Record<PlaybackSpeed, string> = { 0.5: '0,5×', 1: '1×', 2: '2×' };
const SPEED_INTERVAL_MS: Record<PlaybackSpeed, number> = { 0.5: 1000, 1: 500, 2: 250 };

interface ProductionLineProps {
  config: ProductionLineConfig;
  onBackToPreparation: () => void;
  onViewHistory: () => void;
  onCompare: (runId: string) => void;
  onCompareRuns: (runIds: string[]) => void;
  onStartIntervention: (config: ProductionLineConfig) => void;
}

export function ProductionLine({
  config,
  onBackToPreparation,
  onViewHistory,
  onCompare,
  onCompareRuns,
  onStartIntervention,
}: ProductionLineProps) {
  const storeConfig = useRunStore((s) => s.config);
  const state = useRunStore((s) => s.state);
  const uiStatus = useRunStore((s) => s.uiStatus);
  const playbackSpeed = useRunStore((s) => s.playbackSpeed);
  const startRun = useRunStore((s) => s.startRun);
  const processNextStage = useRunStore((s) => s.processNextStage);
  const completeDay = useRunStore((s) => s.completeDay);
  const advanceAutoTurn = useRunStore((s) => s.advanceAutoTurn);
  const play = useRunStore((s) => s.play);
  const pause = useRunStore((s) => s.pause);
  const setPlaybackSpeed = useRunStore((s) => s.setPlaybackSpeed);
  const clearRun = useRunStore((s) => s.clearRun);

  const prediction = usePreparationStore((s) => s.prediction);
  const pendingRun = useHistoryStore((s) => s.pendingRun);

  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [animating, setAnimating] = useState(true);
  const recordedId = useRunStore((s) => s.completedRunId);

  // Não inicia a partida aqui: `FactoryExperience.start()` já chama
  // `startRun` antes de mudar para esta tela, e uma sessão recuperada já
  // chega com `resumeRun` aplicado pelo efeito de restauração do pai. Fazer
  // isso aqui também correria contra esse efeito de restauração — o de um
  // componente FILHO dispara antes do EFEITO DO PAI, então este componente
  // sobrescreveria uma partida recém-recuperada com uma nova, vazia, antes
  // da restauração real acontecer (bug encontrado via E2E: `state` recuperado
  // não coincidia com a última posição salva — ver docs/decisions.md).

  // Reprodução automática: intervalo próprio, nunca por quadro — turnos são
  // discretos e pouco frequentes (§6). Pausa sozinha ao ocultar a aba, sem
  // compensar o tempo fora dela.
  useEffect(() => {
    if (uiStatus !== 'running') return;

    const intervalMs = SPEED_INTERVAL_MS[playbackSpeed];
    const id = window.setInterval(() => {
      if (document.hidden) return;
      advanceAutoTurn();
    }, intervalMs);

    const onVisibilityChange = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [uiStatus, playbackSpeed, advanceAutoTurn, pause]);

  const activeConfig = storeConfig ?? config;
  const descriptor = state ? nextTurnDescriptor(activeConfig, state) : null;
  const summary = useMemo(() => (state ? summarize(activeConfig, state) : null), [activeConfig, state]);
  const lastEvent = state && state.events.length > 0 ? state.events[state.events.length - 1] : null;
  const isCompleted = state?.status === 'completed';
  const isConstraintFlow = activeConfig.experience === 'constraint-flow';

  const canManualAct = !pendingRun && !animating && (uiStatus === 'ready' || uiStatus === 'paused');
  const hasProgress = (state?.events.length ?? 0) > 0;

  const handleBackRequest = () => {
    if (hasProgress && !isCompleted) {
      pause();
      setConfirmingAbandon(true);
      return;
    }
    clearRun();
    onBackToPreparation();
  };

  const confirmAbandon = () => {
    setConfirmingAbandon(false);
    clearRun();
    onBackToPreparation();
  };

  const handleRepeatSameRolls = () => {
    startRun(activeConfig);
  };

  const handleNewSequence = () => {
    if (pendingRun) return;
    startRun(withNewSeed(activeConfig));
  };

  if (!state) {
    return <div className="h-40 w-full animate-pulse rounded-lg border bg-card" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          onClick={handleBackRequest}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Preparação
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          onClick={onViewHistory}
        >
          <History className="size-4" aria-hidden="true" />
          Histórico
        </button>
      </div>

      <div aria-live={uiStatus === 'running' ? 'off' : 'polite'} className="text-sm font-medium">
        {isCompleted
          ? 'Partida concluída.'
          : descriptor
            ? `Dia ${descriptor.roundIndex + 1} de ${activeConfig.rounds} · setor ${descriptor.stageIndex + 1} de ${activeConfig.stages.length}`
            : ''}
      </div>

      {isConstraintFlow && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold">Restrição e melhoria do fluxo</span> · {interventionLabel(activeConfig)}
          {activeConfig.intervention && ' — mesmos sorteios da linha de base, recomeçando do dia 1'}
        </p>
      )}

      {lastEvent && (
        <div aria-live={uiStatus === 'running' ? 'off' : 'polite'} aria-atomic="true" className="rounded-lg border bg-card p-3 text-sm">
          {isConstraintFlow ? (
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <DieBox value={lastEvent.die} label="Dado — componente variável" tone="die" />
              <span className="text-2xl text-muted-foreground" aria-hidden="true">→</span>
              <DieBox value={lastEvent.availableCapacity} label="Capacidade disponível hoje" tone="capacity" />
              <div className="min-w-60 flex-1">
                <p className="font-semibold">{stageLabel(activeConfig.stages[lastEvent.stageIndex])}</p>
                <p>{capacityBreakdown(activeConfig, lastEvent)}</p>
                <p className="text-xs text-muted-foreground">
                  Capacidade média do setor: {summary?.nominalMeanByStage[lastEvent.stageId].toLocaleString('pt-BR')} lotes/dia
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-amber-500 bg-amber-50 text-4xl font-bold tabular-nums text-amber-950">{lastEvent.die}</span>
              <div><p className="font-semibold">Dado sorteado · {stageLabel(activeConfig.stages[lastEvent.stageIndex])}</p>
                <p className="text-muted-foreground">Capacidade de {lastEvent.die} lotes · transferidos: {lastEvent.transferred} lotes</p></div>
            </div>
          )}
          <p className="font-medium">
            {stageLabel(activeConfig.stages[lastEvent.stageIndex])} · capacidade: {formatLots(lastEvent.availableCapacity)} ·{' '}
            {lastEvent.availableBefore === null
              ? 'entrada disponível'
              : `material disponível: ${formatLots(lastEvent.availableBefore)}`}{' '}
            · processados e transferidos: {formatLots(lastEvent.transferred)} · capacidade não utilizada:{' '}
            {formatLots(lastEvent.unusedCapacity)}
          </p>
          {lastEvent.transferred === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Sem material para processar.</p>
          )}
          {hadInsufficientMaterial(lastEvent) && lastEvent.transferred > 0 && (
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
              Material insuficiente para aproveitar toda a capacidade: havia {formatLots(lastEvent.availableBefore!)} para uma
              capacidade de {formatLots(lastEvent.availableCapacity)} — {formatLots(lastEvent.unusedCapacity)} de capacidade não utilizada.
            </p>
          )}
        </div>
      )}

      {!isCompleted && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40"
            disabled={!canManualAct}
            onClick={processNextStage}
          >
            <SkipForward className="size-4" aria-hidden="true" />
            Processar próximo setor
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40"
            disabled={!canManualAct}
            onClick={completeDay}
          >
            Completar dia
          </button>
          {uiStatus === 'running' ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={pause}
            >
              <Pause className="size-4" aria-hidden="true" />
              Pausar
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              onClick={play}
              disabled={!!pendingRun || animating}
            >
              <Play className="size-4" aria-hidden="true" />
              Automático
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Reprodução:</span>
            {([0.5, 1, 2] as PlaybackSpeed[]).map((speed) => (
              <button
                key={speed}
                type="button"
                className={`rounded-md border px-2 py-1 font-medium ${
                  playbackSpeed === speed ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                }`}
                onClick={() => setPlaybackSpeed(speed)}
              >
                {SPEED_LABELS[speed]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {isConstraintFlow
          ? 'Cada setor mostra o dado (1 a 6) somado à sua capacidade adicional: essa soma é a capacidade disponível hoje. As filas mostram os lotes aguardando o próximo processamento.'
          : 'Dado: capacidade disponível hoje, de 1 a 6 lotes. As filas mostram os lotes aguardando o próximo processamento.'}
      </p>
      <FactoryPixiCanvas
        onAnimatingChange={setAnimating}
        stages={activeConfig.stages}
        experience={activeConfig.experience}
        capacityProfiles={activeConfig.capacityProfiles}
        running={uiStatus === 'running'}
        tempoMs={SPEED_INTERVAL_MS[playbackSpeed]}
        state={state}
        activeStageIndex={descriptor ? descriptor.stageIndex : null}
      />

      <PendingRunNotice />
      {summary && <RunObservations config={activeConfig} state={state} summary={summary} />}

      {summary && (
        <StageTable
          config={activeConfig}
          state={state}
          summary={summary}
          activeStageIndex={descriptor ? descriptor.stageIndex : null}
        />
      )}

      {isCompleted && summary && (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <h3 className="text-base font-semibold">Resultado</h3>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Entregue</dt>
              <dd className="font-medium tabular-nums">{formatLots(summary.delivered)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estoque restante</dt>
              <dd className="font-medium tabular-nums">{formatLots(summary.inventoryRemaining)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {isConstraintFlow
                  ? `Referência pela menor capacidade média (${summary.referenceRatePerRound.toLocaleString('pt-BR')} × dias)`
                  : 'Referência (3,5 × rodada)'}
              </dt>
              <dd className="font-medium tabular-nums">{formatLots(summary.referenceAccumulated)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Desvio da entrega</dt>
              <dd className={`font-medium tabular-nums ${summary.deviationDelivered < 0 ? 'text-destructive' : ''}`}>
                {summary.deviationDelivered >= 0 ? '+' : ''}
                {formatLots(summary.deviationDelivered)}
              </dd>
            </div>
          </dl>

          {prediction !== null && (
            <p className="text-sm text-muted-foreground">
              A previsão do grupo era {prediction} lotes; a entrega real foi {summary.delivered} lotes — uma
              diferença de {Math.abs(summary.delivered - prediction)} lotes.
            </p>
          )}

          {activeConfig.hypothesis && (
            <div className="rounded-md border bg-background p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Hipótese registrada antes de começar</p>
              <p className="mt-1">{activeConfig.hypothesis}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Um estoque intermediário não é uma entrega ao cliente — {formatLots(summary.inventoryRemaining)} seguem em
            processo, não expedidos.
          </p>

          {isConstraintFlow && (
            <ConstraintFlowPanel
              config={activeConfig}
              state={state}
              summary={summary}
              runId={recordedId}
              disabled={!!pendingRun}
              onStartIntervention={onStartIntervention}
              onCompareRuns={onCompareRuns}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" disabled={!!pendingRun} onClick={handleRepeatSameRolls}>
              Repetir os mesmos sorteios
            </button>
            <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" disabled={!!pendingRun} onClick={handleNewSequence}>
              Nova sequência de dados
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => {
                clearRun();
                onBackToPreparation();
              }}
            >
              Nova partida
            </button>
            {recordedId && (
              <button
                type="button"
                className="ml-auto rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={() => onCompare(recordedId)}
              >
                Comparar com outra partida
              </button>
            )}
          </div>
        </div>
      )}

      {confirmingAbandon && (
        <ConfirmDialog
          title="Descartar o progresso desta partida?"
          description="A partida em andamento ainda não terminou. Voltar agora descarta o progresso não concluído — o histórico de partidas já registradas não é afetado."
          confirmLabel="Descartar e voltar"
          onConfirm={confirmAbandon}
          onCancel={() => setConfirmingAbandon(false)}
        />
      )}
    </div>
  );
}

function DieBox({ value, label, tone }: { value: number; label: string; tone: 'die' | 'capacity' }) {
  const toneClass =
    tone === 'die'
      ? 'border-amber-500 bg-amber-50 text-amber-950'
      : 'border-primary bg-primary/10 text-primary';
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center">
      <span className={`flex size-14 items-center justify-center rounded-xl border-2 text-4xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </span>
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}
