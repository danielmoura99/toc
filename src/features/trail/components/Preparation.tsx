'use client';

/**
 * Painel de preparação — entrega 2.
 *
 * Reúne as decisões coletivas tomadas entre tentativas: ordem da fila,
 * distribuição das mochilas, quem representa cada personagem e a hipótese do
 * grupo. A caminhada em si é automática.
 *
 * Duas camadas de verificação, como o guia separa (§11.1):
 *  - a etapa guiada decide o que pode ser *editado* (camada de aplicação);
 *  - `validateConfig` decide se a configuração é *válida* (domínio).
 * Uma configuração inválida bloqueia o início.
 */

import { useMemo } from 'react';
import { AlertTriangle, BatteryWarning, Play, RotateCcw, Shuffle } from 'lucide-react';

import { computeLoadByCharacter } from '../domain/engine';
import { validateConfig } from '../domain/validation';
import type { AttemptConfig, GuidedStage } from '../domain/types';
import { GUIDED_STAGES, HYPOTHESIS_MAX_LENGTH, getStage } from '../application/stages';
import { useAttemptsStore } from '../application/attemptsStore';
import { scenarioDisplayLabel } from '../scenarios';
import { BackpackEditor } from './BackpackEditor';
import { CapacityDiagnosisPanel } from './CapacityDiagnosisPanel';
import { QueueEditor } from './QueueEditor';
import { canAccessStage, usePreparationStore } from '../application/preparationStore';

const STAGE_LOCK_MESSAGE = 'Conclua a primeira caminhada para liberar as próximas etapas.';

interface PreparationProps {
  onStart: (config: AttemptConfig) => void;
  onViewHistory: () => void;
  onNewExpedition: () => void;
}

export function Preparation({ onStart, onViewHistory, onNewExpedition }: PreparationProps) {
  const expedition = usePreparationStore((state) => state.expedition);
  const stage = usePreparationStore((state) => state.stage);
  const draft = usePreparationStore((state) => state.draft);
  const setStage = usePreparationStore((state) => state.setStage);
  const setOrder = usePreparationStore((state) => state.setOrder);
  const moveCharacter = usePreparationStore((state) => state.moveCharacter);
  const moveItems = usePreparationStore((state) => state.moveItems);
  const setParticipant = usePreparationStore((state) => state.setParticipant);
  const setHypothesis = usePreparationStore((state) => state.setHypothesis);
  const setFatigueMode = usePreparationStore((state) => state.setFatigueMode);
  const resetDraft = usePreparationStore((state) => state.resetDraft);

  const definition = getStage(stage);
  const loads = useMemo(() => computeLoadByCharacter(draft), [draft]);
  const validation = useMemo(() => validateConfig(draft), [draft]);
  const history = useAttemptsStore((state) => state.history);
  const pendingAttempt = useAttemptsStore((state) => state.pendingAttempt);
  // Etapas 2 e 3 exigem uma conclusão da etapa 1 desta expedição no
  // histórico (ajuste de navegação, 22/09/2026) — antes disso, mudar de
  // etapa não tinha efeito nenhum aqui (a store já recusa), mas o botão
  // continuava clicável, sem explicar por quê.
  const stage2Unlocked = useMemo(
    () => canAccessStage(2, expedition, history, pendingAttempt),
    [expedition, history, pendingAttempt],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Etapas guiadas: o operador avança manualmente, sem desbloqueio por
          pontuação — mas 2 e 3 exigem ter concluído a etapa 1 desta
          expedição primeiro (ver stage2Unlocked). */}
      <nav aria-label="Etapas guiadas" className="flex flex-wrap gap-1.5">
        {GUIDED_STAGES.map((candidate) => {
          const item = getStage(candidate);
          const isCurrent = candidate === stage;
          const locked = candidate !== 1 && !stage2Unlocked;

          return (
            <button
              key={candidate}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              disabled={locked}
              title={locked ? STAGE_LOCK_MESSAGE : undefined}
              onClick={() => setStage(candidate as GuidedStage)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                isCurrent ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {candidate} — {item.title}
            </button>
          );
        })}
      </nav>
      {!stage2Unlocked && <p className="text-xs text-muted-foreground">{STAGE_LOCK_MESSAGE}</p>}

      <header className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Etapa {stage} — {definition.title}
          </h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {scenarioDisplayLabel(draft.scenario.id)}
          </span>
        </div>

        <p className="mt-1 text-sm">{definition.mainQuestion}</p>

        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="inline font-medium text-muted-foreground">Pode mudar: </dt>
            <dd className="inline">{definition.allowedDecisions}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-muted-foreground">Mantido igual: </dt>
            <dd className="inline">{definition.preservedConditions}</dd>
          </div>
        </dl>
      </header>

      <CapacityDiagnosisPanel config={draft} defaultOpen={stage2Unlocked} />

      <section className="rounded-lg border bg-card p-4">
        <QueueEditor
          config={draft}
          loads={loads}
          disabled={!definition.canReorder}
          onReorder={setOrder}
          onMove={moveCharacter}
          onParticipantChange={setParticipant}
        />
      </section>

      <section className="rounded-lg border bg-card p-4">
        {definition.canRedistribute ? (
          <BackpackEditor
            config={draft}
            loads={loads}
            disabled={false}
            onTransfer={moveItems}
          />
        ) : (
          <>
            <BackpackEditor config={draft} loads={loads} disabled onTransfer={moveItems} />
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              A etapa {stage} preserva as cargas iniciais. A redistribuição é liberada na etapa 3.
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <label htmlFor="hipotese" className="text-sm font-semibold">
          Hipótese do grupo <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          O que vocês esperam que aconteça, e por quê? Registrar antes evita explicar o resultado
          depois que ele já apareceu.
        </p>

        <textarea
          id="hipotese"
          className="w-full resize-y rounded-md border bg-background p-2 text-sm"
          rows={3}
          maxLength={HYPOTHESIS_MAX_LENGTH}
          value={draft.hypothesis}
          onChange={(event) => setHypothesis(event.target.value)}
          placeholder="O que vocês esperam observar nesta caminhada? Por quê?"
        />

        <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
          {draft.hypothesis.length} / {HYPOTHESIS_MAX_LENGTH}
        </p>
      </section>

      {/* Ativação explícita de fadiga (§7.3, opcional): só depois da primeira
          caminhada concluída desta expedição — mesma condição de
          `stage2Unlocked`. Toda nova tentativa começa desligada; nenhum
          coeficiente é editável aqui (§7.2). */}
      <section className="rounded-lg border bg-card p-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={draft.fatigueMode === 'enabled'}
            disabled={!stage2Unlocked}
            onChange={(event) => setFatigueMode(event.target.checked ? 'enabled' : 'disabled')}
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <BatteryWarning className="size-4" aria-hidden="true" />
              Ativar fadiga (modelo experimental)
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Representa esforço acumulado reduzindo a capacidade ao longo da caminhada — um modelo
              didático proposto para este software, não uma medida fisiológica real. Desligada por
              padrão em toda tentativa nova.
              {!stage2Unlocked && ' Disponível depois da primeira caminhada concluída desta expedição.'}
            </span>
          </span>
        </label>
      </section>

      {pendingAttempt && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              Há uma tentativa concluída aguardando espaço no histórico (20/20).
            </p>
            <p className="mt-1 text-xs">
              Ela não foi perdida, mas uma nova tentativa só pode começar depois de resolver essa —
              senão duas tentativas disputariam a mesma vaga. Abra o histórico para excluir uma
              antiga (a pendente entra automaticamente) ou exportar a sessão.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium underline"
              onClick={onViewHistory}
            >
              Ver histórico
            </button>
          </div>
        </div>
      )}

      {!validation.valid && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Não é possível iniciar com esta configuração</p>
            <ul className="mt-1 list-inside list-disc">
              {validation.issues.map((issue) => (
                <li key={issue.code + (issue.path ?? '')}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!validation.valid || pendingAttempt !== null}
          title={pendingAttempt ? 'Resolva a tentativa pendente no histórico antes de iniciar outra.' : undefined}
          onClick={() => onStart(draft)}
        >
          <Play className="size-4" aria-hidden="true" />
          Iniciar caminhada
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent"
          onClick={resetDraft}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Restaurar configuração inicial
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent"
          onClick={onNewExpedition}
        >
          <Shuffle className="size-4" aria-hidden="true" />
          Nova expedição
        </button>

        <p className="ml-auto text-xs text-muted-foreground">
          Objetivo: o tempo do <strong>último</strong> a chegar
        </p>
      </div>
    </div>
  );
}
