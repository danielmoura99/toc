'use client';

/**
 * Execução de uma tentativa.
 *
 * O relógio é definitivo desde a entrega 1: acumulador de tempo real decidindo
 * quantos ticks executar, `dt` sempre 1 s, pausa automática ao ocultar a aba.
 * Mudar a velocidade de reprodução não altera o resultado (R14).
 *
 * A partir da entrega 3, física e renderização estão desacopladas (§10.2):
 * `stateRef` é atualizada a cada tick e lida diretamente pelo canvas PixiJS a
 * cada quadro; o estado do React (`hudState`), usado pelos indicadores e pela
 * tabela, é publicado no máximo a 10 Hz. O motor continua sendo a única fonte
 * de verdade — o React só publica o que já foi calculado.
 *
 * A configuração recebida é um snapshot imutável: editar a preparação enquanto
 * uma tentativa roda não afeta a execução em andamento (R02).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Pause, Play, SkipForward } from 'lucide-react';

import { computeLoadByCharacter, createInitialState, step } from '../domain/engine';
import { finalizeResult } from '../domain/metrics';
import type { AttemptConfig, AttemptResult, SimulationState } from '../domain/types';
import { getStage } from '../application/stages';
import { useAttemptsStore, type RecordAttemptResult } from '../application/attemptsStore';
import { usePersistenceStatusStore } from '../application/persistenceStatusStore';
import { saveCurrentSession } from '../application/sessionSync';
import { clearActiveAttemptMarker } from '../persistence/localStorageAdapter';
import { scenarioDisplayLabel } from '../scenarios';
import { ConfirmDialog } from './ConfirmDialog';
import { formatClock } from './format';

type PlaybackSpeed = 10 | 30 | 60;
type RunState = 'ready' | 'running' | 'paused' | 'completed' | 'timed_out';

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [10, 30, 60];
const RUN_LABELS: Record<RunState, string> = {
  ready: 'Pronta para iniciar',
  running: 'Caminhada em andamento',
  paused: 'Pausada para discussão',
  completed: 'Todos chegaram',
  timed_out: 'Limite de tempo atingido',
};

/** Publicação máxima do HUD para o React, em ms (§10.2: até 10 Hz). */
const HUD_PUBLISH_INTERVAL_MS = 100;

// Carregado apenas no cliente: WebGL e o ciclo de inicialização assíncrona do
// PixiJS não fazem sentido no servidor (§10.3). O `ssr: false` só é aceito
// dentro de um Client Component — TrailRun já é um.
const PixiCanvas = dynamic(() => import('./PixiCanvas').then((mod) => mod.PixiCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-lg border bg-card text-xs text-muted-foreground sm:h-72">
      Carregando a trilha…
    </div>
  ),
});

interface TrailRunProps {
  config: AttemptConfig;
  onBackToPreparation: () => void;
  /** Chamado quando a tentativa é registrada no histórico (§4.1, §12). */
  onRecorded?: (attempt: AttemptResult, becameReference: boolean) => void;
  onViewHistory: () => void;
}

export function TrailRun({ config, onBackToPreparation, onRecorded, onViewHistory }: TrailRunProps) {
  const [speed, setSpeed] = useState<PlaybackSpeed>(30);
  const [runState, setRunState] = useState<RunState>('ready');
  const [hudState, setHudState] = useState<SimulationState>(() => createInitialState(config));
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const loads = useMemo(() => computeLoadByCharacter(config), [config]);
  const definition = getStage(config.guidedStage);

  // Fonte de verdade lida pelo canvas a cada quadro. Atualizada em todo tick,
  // independente da cadência de publicação do HUD.
  const stateRef = useRef(hudState);
  const lastHudPublishRef = useRef(0);
  // Grava exatamente uma vez por tentativa concluída, no instante em que o
  // status muda para terminal — não num efeito à parte, então não há duas
  // fontes de verdade sobre "já registrei esta tentativa?".
  const recordedRef = useRef(false);
  const [recordOutcome, setRecordOutcome] = useState<RecordAttemptResult | null>(null);

  /** Executa exatamente `count` ticks, ou até a execução encerrar. */
  const advanceTicks = useCallback(
    (count: number) => {
      let next = stateRef.current;

      for (let index = 0; index < count && next.status === 'running'; index += 1) {
        next = step(config, next);
      }

      stateRef.current = next;

      // O HUD em React publica no máximo a 10 Hz; a chegada ao fim é sempre
      // publicada imediatamente, para que o resultado apareça sem atraso.
      const now = performance.now();
      const isTerminal = next.status !== 'running';

      if (isTerminal || now - lastHudPublishRef.current >= HUD_PUBLISH_INTERVAL_MS) {
        lastHudPublishRef.current = now;
        setHudState(next);
      }

      if (isTerminal) {
        setRunState(next.status);
        // Não há mais nada "em andamento" para um recarregamento interromper
        // a partir daqui — a execução terminou, com ou sem espaço para gravar.
        clearActiveAttemptMarker();

        if (!recordedRef.current) {
          recordedRef.current = true;
          const result = useAttemptsStore.getState().recordAttempt(config, next);
          setRecordOutcome(result);
          if (result.ok) onRecorded?.(result.attempt, result.becameReference);

          // Salva imediatamente, sem esperar o debounce da preparação (§12:
          // "salvar... ao concluir uma execução" é um gatilho próprio, não o
          // mesmo caso de mudanças de preparação em sequência rápida). Sem
          // isto, um recarregamento nos ~500 ms seguintes à conclusão pode
          // perder exatamente o resultado que acabou de ser calculado.
          usePersistenceStatusStore.getState().setSaveOutcome(saveCurrentSession());
        }
      }

      return next;
    },
    [config, onRecorded],
  );

  // Laço de reprodução. O acumulador guarda a fração de tick não consumida, de
  // modo que nenhum tick é descartado silenciosamente se um quadro atrasar.
  useEffect(() => {
    if (runState !== 'running') return;

    let frame = 0;
    let lastTimestamp = performance.now();
    let accumulator = 0;

    const loop = (timestamp: number) => {
      const realDelta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      accumulator += realDelta * speed;

      // Teto de trabalho por quadro: mantém a página responsiva sem perder o
      // saldo do acumulador. Uma máquina lenta reproduz mais devagar em tempo
      // real; o resultado simulado é o mesmo.
      const ticks = Math.min(Math.floor(accumulator), 240);
      accumulator -= ticks;

      if (ticks > 0 && advanceTicks(ticks).status !== 'running') return;

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [runState, speed, advanceTicks]);

  // Ocultar a aba pausa e descarta a duração real em segundo plano. Retomar
  // exige ação do operador.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setRunState((current) => (current === 'running' ? 'paused' : current));
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const finished = runState === 'completed' || runState === 'timed_out';
  const metrics = finished ? finalizeResult(config, hudState) : null;
  // "running" e "paused" têm progresso simulado real; sair dali sem avisar
  // descartaria esse progresso sem que o operador tenha escolhido isso (§7.6:
  // "Reiniciar uma execução ativa exige confirmação de descarte do
  // progresso"). "ready" não tem nada a perder; "completed"/"timed_out" já
  // está registrado (ou preservado — ver histórico cheio), então também não.
  const hasUnconfirmedProgress = runState === 'running' || runState === 'paused';

  const requestBackToPreparation = () => {
    if (hasUnconfirmedProgress) {
      setShowDiscardConfirm(true);
    } else {
      onBackToPreparation();
    }
  };

  const positions = config.order.map((id) => hudState.characters[id].positionM);
  const spreadM = Math.max(...positions) - Math.min(...positions);
  const progressPct = (Math.min(...positions) / config.scenario.distanceM) * 100;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-3 py-1 text-sm font-semibold">
            Etapa {config.guidedStage} — {definition.title}
          </span>
          <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">
            {scenarioDisplayLabel(config.scenario.id)}
          </span>
          <span role="status" className="ml-auto text-sm font-semibold">
            {RUN_LABELS[runState]}
          </span>
        </div>
        <div>
          <h2 className="text-xl font-semibold leading-snug sm:text-2xl">{definition.mainQuestion}</h2>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Objetivo: percorrer {config.scenario.distanceM.toLocaleString('pt-BR')} m
            {' '}no menor tempo até <strong>todos chegarem</strong>.
          </p>
        </div>
        {config.hypothesis && (
          <p className="mt-1 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">Hipótese: </span>
            {config.hypothesis}
          </p>
        )}
        <details className="text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
            Detalhes da tentativa
          </summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            <div><dt className="font-medium">Condição aleatória (seed)</dt><dd className="break-all font-mono">{config.seed}</dd></div>
            <div><dt className="font-medium">Versão do motor</dt><dd>{config.engineVersion}</dd></div>
            <div><dt className="font-medium">Revisão do cenário</dt><dd>{config.scenario.revision}</dd></div>
          </dl>
          <p className="mt-2">A mesma seed preserva as variações de ritmo nas tentativas comparáveis.</p>
        </details>
      </header>

      {showDiscardConfirm && (
        <ConfirmDialog
          title="Descartar o progresso desta tentativa?"
          description={`O relógio simulado está em ${formatClock(hudState.elapsedSec)}. Voltar para a preparação agora descarta esse progresso — ele não é salvo como resultado. Esta tentativa não pode ser retomada depois.`}
          confirmLabel="Descartar e voltar"
          cancelLabel={runState === 'running' ? 'Continuar caminhada' : 'Continuar tentativa'}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onBackToPreparation();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

      <section aria-label="Controles da caminhada" className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          onClick={requestBackToPreparation}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Preparação
        </button>

        {runState !== 'running' ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => setRunState('running')}
            disabled={finished}
          >
            <Play className="size-4" aria-hidden="true" />
            {runState === 'paused' ? 'Continuar' : 'Iniciar'}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground"
            onClick={() => setRunState('paused')}
          >
            <Pause className="size-4" aria-hidden="true" />
            Pausar
          </button>
        )}

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => advanceTicks(30)}
          // Só disponível pausado (§7.6): em "ready" ainda não existe uma
          // execução em curso para avançar.
          disabled={runState !== 'paused'}
        >
          <SkipForward className="size-4" aria-hidden="true" />
          Avançar 30 s
        </button>

        <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-2 gap-y-1 sm:ml-auto">
          <span className="text-sm text-muted-foreground">Reprodução</span>
          {PLAYBACK_SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={speed === option}
              title={`${option} segundos simulados por segundo real`}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                speed === option ? 'bg-accent' : ''
              }`}
              onClick={() => setSpeed(option)}
            >
              {option}s/s
            </button>
          ))}
          <span className="col-span-4 text-xs text-muted-foreground sm:text-right">Segundos simulados por segundo real</span>
        </div>
      </section>

      <section aria-label="Indicadores da caminhada" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicator label="Relógio simulado" value={formatClock(hudState.elapsedSec)} description={finished ? 'Tempo simulado ao encerrar' : 'Conta somente durante a caminhada'} prominent />
        <Indicator label="Progresso do último" value={`${progressPct.toFixed(1)}%`} description="O grupo termina quando chegar a 100%" prominent />
        <Indicator label="Dispersão atual" value={`${Math.round(spreadM)} m`} description="Distância entre o primeiro e o último" />
        <Indicator label="Dispersão máxima" value={`${Math.round(hudState.maxSpreadM)} m`} description="Maior distância observada nesta tentativa" />
      </section>

      {/* Trilha em PixiJS. O canvas lê stateRef a cada quadro — não hudState —
          então a animação não fica presa à cadência de publicação do HUD. */}
      <PixiCanvas config={config} stateRef={stateRef} />

      {/* Tabela textual equivalente, exigida pela acessibilidade (§9.2).
          Separa capacidade estimada (velocidade disponível), avanço observado
          (velocidade efetiva e posição) e limitação pela fila — as três
          coisas que o guia (§2) pede que fiquem visíveis e distintas, não
          escondidas dentro do motor. */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-lg font-semibold">
          {metrics ? 'Resultado' : 'Posições e limitação'}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Disponível: ritmo possível com a carga e a variação atuais. Efetiva: avanço observado.
          {' '}Estar limitado pela fila não significa estar parado.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Personagem</th>
                <th className="py-1.5 text-right font-medium">Carga</th>
                <th className="py-1.5 text-right font-medium" title="Quanto o personagem poderia andar agora, sem a fila">
                  Vel. disponível
                </th>
                <th className="py-1.5 text-right font-medium" title="Quanto o personagem andou de fato neste instante">
                  Vel. efetiva
                </th>
                <th className="py-1.5 text-right font-medium">Posição</th>
                <th className="py-1.5 text-right font-medium">Chegada</th>
                <th className="py-1.5 text-right font-medium" title="Andou abaixo da capacidade por causa de quem está à frente">
                  Limitado
                </th>
                <th className="py-1.5 text-right font-medium" title="Subconjunto do limitado em que o avanço foi praticamente nulo">
                  Parado
                </th>
              </tr>
            </thead>
            <tbody>
              {config.order.map((characterId) => {
                const character = config.scenario.characters.find((item) => item.id === characterId)!;
                const walker = hudState.characters[characterId];

                return (
                  <tr key={characterId} className="border-b last:border-0">
                    <td className="py-1.5">{character.displayName}</td>
                    <td className="py-1.5 text-right tabular-nums">{loads[characterId]} kg</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {(walker.availableSpeedMps * 3.6).toFixed(1)} km/h
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {(walker.actualSpeedMps * 3.6).toFixed(1)} km/h
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Math.round(walker.positionM)} m
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {walker.arrivalTimeSec !== null ? formatClock(walker.arrivalTimeSec) : '—'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatClock(walker.limitedTimeSec)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatClock(walker.stoppedByQueueTimeSec)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {metrics && (
          <div className="mt-4 border-t pt-3 text-sm">
            {metrics.outcome === 'completed' ? (
              <p>
                <strong>Todos chegaram em {formatClock(metrics.totalTimeSec!)}.</strong> Dispersão
                máxima de {Math.round(metrics.maxSpreadM)} m e média de{' '}
                {Math.round(metrics.meanSpreadM)} m.
              </p>
            ) : (
              <p>
                <strong>Limite de tempo atingido.</strong> O grupo alcançou{' '}
                {metrics.collectiveProgressPct.toFixed(1)}% do percurso. Sem tempo total: nem todos
                chegaram.
              </p>
            )}

            {/* Tempo equivalente perdido: diagnóstico auxiliar (§8.1), só faz
                sentido olhar para trás, ao final — não a cada tick. */}
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium">
                Tempo equivalente perdido por limitação (diagnóstico auxiliar)
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {config.order.map((characterId) => {
                  const character = config.scenario.characters.find((item) => item.id === characterId)!;
                  return (
                    <li key={characterId}>
                      {character.displayName}: {formatClock(metrics.equivalentLostTimeByCharacter[characterId])}
                    </li>
                  );
                })}
              </ul>
            </details>

            {recordOutcome?.ok && (
              <p className="mt-2 text-xs text-muted-foreground">
                Tentativa registrada no histórico.
                {recordOutcome.becameReference &&
                  ' Esta é a referência inicial da etapa 1 — as próximas comparações partem dela.'}
              </p>
            )}

            {recordOutcome && !recordOutcome.ok && (
              <p role="alert" className="mt-2 text-xs font-medium text-amber-700">
                Histórico cheio (20/20) — esta tentativa ainda não foi registrada, mas{' '}
                <strong>não foi perdida</strong>: fica guardada até você excluir uma tentativa antiga
                (ela entra automaticamente) ou exportar a sessão. Um aviso vai acompanhar você até lá.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                onClick={onBackToPreparation}
              >
                Nova tentativa
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                onClick={onViewHistory}
              >
                Ver histórico e comparar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Indicator({ label, value, description, prominent = false }: {
  label: string;
  value: string;
  description: string;
  prominent?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={`rounded-xl border p-3 ${prominent ? 'border-primary/25 bg-primary/5' : 'bg-card'}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
