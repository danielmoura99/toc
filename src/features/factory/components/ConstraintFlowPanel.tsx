'use client';

/**
 * Resultado da experiência "Restrição e melhoria do fluxo" (§6, §8.2):
 * hipótese → diagnóstico → escolher melhoria → prever → executar → comparar
 * → reavaliar.
 *
 * O diagnóstico estrutural (menor capacidade média configurada) fica
 * separado das evidências observadas nesta execução, e só aparece depois de
 * o grupo registrar sua hipótese — sem pontuação e sem bloqueio por resposta
 * "errada" (§6.1).
 */

import { useMemo, useState } from 'react';
import { FlaskConical, GitCompare, Play } from 'lucide-react';

import { useHistoryStore } from '../application/historyStore';
import { diagnoseConstraint } from '../domain/capacity';
import { baselineConfigOf, buildInterventionConfig } from '../domain/config';
import { runToEnd } from '../domain/engine';
import { summarize, type RunSummary } from '../domain/metrics';
import { HYPOTHESIS_MAX_LENGTH } from '../domain/validation';
import type { AddedCapacity, ProductionLineConfig, ProductionLineState, StageId } from '../domain/types';
import { formatLots, formatNumber, formatPercent, formatSigned, interventionLabel, sectorName } from './capacityText';

interface ConstraintFlowPanelProps {
  config: ProductionLineConfig;
  state: ProductionLineState;
  summary: RunSummary;
  runId: string | null;
  disabled: boolean;
  onStartIntervention: (config: ProductionLineConfig) => void;
  onCompareRuns: (runIds: string[]) => void;
}

const UNKNOWN = '__unknown__';

export function ConstraintFlowPanel({ config, state, summary, runId, disabled, onStartIntervention, onCompareRuns }: ConstraintFlowPanelProps) {
  const history = useHistoryStore((s) => s.history);
  const pendingRun = useHistoryStore((s) => s.pendingRun);
  const setConstraintGuess = useHistoryStore((s) => s.setConstraintGuess);

  const isBaseline = config.intervention === null;
  const baselineRunId = config.intervention?.baselineRunId ?? runId;
  const knownRuns = pendingRun ? [...history, pendingRun] : history;
  const baselineRun = knownRuns.find((run) => run.id === baselineRunId) ?? null;
  const guess = baselineRun?.constraintGuess ?? null;
  const needsGuess = isBaseline && guess === null;

  return (
    <section aria-label="Restrição e melhoria do fluxo" className="flex flex-col gap-4">
      {needsGuess && runId ? (
        <HypothesisForm
          config={config}
          onSubmit={(stageId, justification) => setConstraintGuess(runId, { stageId, justification })}
        />
      ) : (
        <>
          {guess && (
            <p className="rounded-lg border bg-card p-3 text-sm">
              <span className="font-medium">Hipótese do grupo:</span>{' '}
              {guess.stageId ? sectorName(config, guess.stageId) : 'Ainda não sei'}
              {guess.justification && <span className="text-muted-foreground"> — {guess.justification}</span>}
            </p>
          )}
          <Diagnosis config={config} state={state} summary={summary} />
          {!isBaseline && <BeforeAfter config={config} summary={summary} />}
          <CompareActions
            config={config}
            runId={runId}
            baselineRunId={baselineRunId}
            history={history}
            onCompareRuns={onCompareRuns}
          />
          {!disabled && baselineRunId && (
            <InterventionForm config={config} baselineRunId={baselineRunId} onStart={onStartIntervention} />
          )}
        </>
      )}
    </section>
  );
}

function HypothesisForm({
  config,
  onSubmit,
}: {
  config: ProductionLineConfig;
  onSubmit: (stageId: StageId | null, justification: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const [justification, setJustification] = useState('');

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border-2 border-primary/40 bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!choice) return;
        onSubmit(choice === UNKNOWN ? null : choice, justification);
      }}
    >
      <h3 className="text-base font-semibold">Qual setor você considera a restrição?</h3>
      <p className="text-sm text-muted-foreground">
        Responda antes de ver o diagnóstico. Não há pontuação — a resposta serve para comparar com as evidências.
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Setor considerado a restrição</legend>
        {config.stages.map((stage, index) => (
          <label key={stage.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${choice === stage.id ? 'border-primary bg-primary/10' : ''}`}>
            <input type="radio" name="constraint-guess" className="sr-only" value={stage.id} checked={choice === stage.id} onChange={() => setChoice(stage.id)} />
            {index + 1}. {stage.sectorName}
          </label>
        ))}
        <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${choice === UNKNOWN ? 'border-primary bg-primary/10' : ''}`}>
          <input type="radio" name="constraint-guess" className="sr-only" value={UNKNOWN} checked={choice === UNKNOWN} onChange={() => setChoice(UNKNOWN)} />
          Ainda não sei
        </label>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        Que evidências sustentam sua escolha? <span className="text-muted-foreground">(opcional)</span>
        <textarea
          className="min-h-16 rounded-md border bg-background px-2 py-1.5"
          maxLength={HYPOTHESIS_MAX_LENGTH}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={!choice}
        className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Registrar hipótese e ver diagnóstico
      </button>
    </form>
  );
}

/** Fila de entrada de cada setor ao final de cada dia encerrado (evidência observada, §6.2). */
function queuesAtEndOfDay(config: ProductionLineConfig, state: ProductionLineState): Array<Record<StageId, number>> {
  const lastStage = config.stages.length - 1;
  return state.events.filter((event) => event.stageIndex === lastStage).map((event) => event.inventoryAfter);
}

function Diagnosis({ config, state, summary }: { config: ProductionLineConfig; state: ProductionLineState; summary: RunSummary }) {
  const diagnosis = diagnoseConstraint(config);
  const original = diagnosis.originalConstraintStageId;
  const constrainedNames = diagnosis.constrainedStageIds.map((id) => sectorName(config, id));
  const days = queuesAtEndOfDay(config, state);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h3 className="text-base font-semibold">Diagnóstico</h3>

      <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
        <p className="font-semibold">
          {diagnosis.isTie
            ? `Empate na menor capacidade média (${formatNumber(diagnosis.minMean)} lotes/dia)`
            : `Restrição por capacidade média: ${constrainedNames[0]} (${formatNumber(diagnosis.minMean)} lotes/dia)`}
        </p>
        <p className="mt-1">
          {diagnosis.isTie
            ? `${constrainedNames.join(', ')} empatam na menor média. Não há uma nova restrição única — é preciso reavaliar a linha.`
            : 'Diagnóstico estrutural: é o setor com a menor capacidade média configurada.'}
        </p>
      </div>

      {original && <OriginalConstraintEvidence config={config} summary={summary} stageId={original} isUnique={diagnosis.originalIsUniqueConstraint} />}

      <p className="text-xs text-muted-foreground">
        Evidências observadas nesta execução. A menor média não explica sozinha todas as oscilações da entrega, e nenhuma
        coluna abaixo — menor transferência, maior fila ou utilização mais alta — identifica a restrição por si só.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-220 border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="p-2 font-medium">Setor</th>
              <th scope="col" className="p-2 font-medium">Capacidade média do setor</th>
              <th scope="col" className="p-2 font-medium">Capacidade disponível acumulada</th>
              <th scope="col" className="p-2 font-medium">Processado</th>
              <th scope="col" className="p-2 font-medium">Não utilizada por falta de material</th>
              <th scope="col" className="p-2 font-medium">Aproveitamento</th>
              <th scope="col" className="p-2 font-medium">Dias com material insuficiente</th>
              <th scope="col" className="p-2 font-medium">Fila de entrada no fim</th>
            </tr>
          </thead>
          <tbody>
            {config.stages.map((stage, index) => {
              const isMin = diagnosis.constrainedStageIds.includes(stage.id);
              return (
                <tr key={stage.id} className={`border-b last:border-0 ${isMin ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                  <th scope="row" className="p-2 text-left font-medium">
                    {index + 1}. {stage.sectorName}
                    {isMin && <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-xs text-white">{diagnosis.isTie ? 'empate' : 'menor média'}</span>}
                    {stage.id === original && <span className="ml-2 text-xs text-muted-foreground">(restrição original)</span>}
                  </th>
                  <td className="p-2 tabular-nums">{formatNumber(diagnosis.meanByStage[stage.id])} lotes/dia</td>
                  <td className="p-2 tabular-nums">{formatLots(summary.capacitySampledByStage[stage.id])}</td>
                  <td className="p-2 tabular-nums">{formatLots(summary.transferredByStage[stage.id])}</td>
                  <td className="p-2 tabular-nums">{index === 0 ? '— (fonte irrestrita)' : formatLots(summary.unusedCapacityByStage[stage.id])}</td>
                  <td className="p-2 tabular-nums">{formatPercent(summary.utilizationByStage[stage.id])}</td>
                  <td className="p-2 tabular-nums">{index === 0 ? '—' : summary.insufficientMaterialTurnsByStage[stage.id]}</td>
                  <td className="p-2 tabular-nums">{index === 0 ? 'entrada disponível' : formatLots(summary.inventoryByStage[stage.id])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Um aproveitamento alto num setor não é objetivo nem prova de eficiência do sistema — a saída da linha é o que conta.
      </p>

      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Fila de entrada ao final de cada dia</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-1.5">Dia</th>
                {config.stages.slice(1).map((stage, index) => (
                  <th scope="col" key={stage.id} className="p-1.5">{index + 2}. {stage.sectorName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((queues, day) => (
                <tr key={day} className="border-t">
                  <th scope="row" className="p-1.5 font-normal">{day + 1}</th>
                  {config.stages.slice(1).map((stage) => (
                    <td key={stage.id} className="p-1.5 tabular-nums">{queues[stage.id]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function OriginalConstraintEvidence({
  config,
  summary,
  stageId,
  isUnique,
}: {
  config: ProductionLineConfig;
  summary: RunSummary;
  stageId: StageId;
  isUnique: boolean;
}) {
  const name = sectorName(config, stageId);
  const unused = summary.unusedCapacityByStage[stageId];
  const days = summary.insufficientMaterialTurnsByStage[stageId];
  return (
    <p className="text-sm">
      {isUnique ? `${name} tem a menor capacidade média.` : `${name} era a restrição original na linha de base.`}{' '}
      {unused > 0
        ? `Nesta execução, deixou de aproveitar ${formatLots(unused)} de capacidade porque não havia material suficiente (${days} ${days === 1 ? 'dia' : 'dias'}). Isso mostra que a restrição depende das entregas anteriores.`
        : 'Nesta execução, aproveitou toda a capacidade disponível: sempre havia material na fila.'}
    </p>
  );
}

/** Antes/depois contra a linha de base — recalculada da própria tentativa, então nunca some (§9). */
function BeforeAfter({ config, summary }: { config: ProductionLineConfig; summary: RunSummary }) {
  const baseline = useMemo(() => {
    const baseConfig = baselineConfigOf(config);
    return summarize(baseConfig, runToEnd(baseConfig));
  }, [config]);
  const original = config.originalConstraintStageId!;
  const originalName = sectorName(config, original);

  const rows: Array<[string, string, string, string]> = [
    ['Lotes expedidos', formatLots(baseline.delivered), formatLots(summary.delivered), formatSigned(summary.delivered - baseline.delivered)],
    [
      'Taxa de entrega (lotes/dia)',
      formatNumber(baseline.meanOutputPerRound ?? 0, 2),
      formatNumber(summary.meanOutputPerRound ?? 0, 2),
      formatSigned((summary.meanOutputPerRound ?? 0) - (baseline.meanOutputPerRound ?? 0)),
    ],
    ['Estoque em processo', formatLots(baseline.inventoryRemaining), formatLots(summary.inventoryRemaining), formatSigned(summary.inventoryRemaining - baseline.inventoryRemaining)],
    [
      `${originalName}: não utilizada por falta de material`,
      formatLots(baseline.unusedCapacityByStage[original]),
      formatLots(summary.unusedCapacityByStage[original]),
      formatSigned(summary.unusedCapacityByStage[original] - baseline.unusedCapacityByStage[original]),
    ],
    [
      `${originalName}: aproveitamento`,
      formatPercent(baseline.utilizationByStage[original]),
      formatPercent(summary.utilizationByStage[original]),
      '',
    ],
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <h3 className="text-base font-semibold">Antes e depois — {interventionLabel(config)}</h3>
      <p className="text-sm text-muted-foreground">
        Mesmos sorteios da linha de base, desde o dia 1 com filas vazias; só a capacidade de{' '}
        {sectorName(config, config.intervention!.targetStageId)} mudou. Julgue a melhoria pela entrega e pelo estoque.
      </p>
      {config.intervention!.prediction && (
        <p className="text-sm">
          <span className="font-medium">Previsão registrada:</span> {config.intervention!.prediction}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="p-2 font-medium">Indicador</th>
              <th scope="col" className="p-2 font-medium">Linha de base</th>
              <th scope="col" className="p-2 font-medium">{interventionLabel(config)}</th>
              <th scope="col" className="p-2 font-medium">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, before, after, delta]) => (
              <tr key={label} className="border-b last:border-0">
                <th scope="row" className="p-2 text-left font-medium">{label}</th>
                <td className="p-2 tabular-nums">{before}</td>
                <td className="p-2 tabular-nums">{after}</td>
                <td className="p-2 tabular-nums">{delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareActions({
  config,
  runId,
  baselineRunId,
  history,
  onCompareRuns,
}: {
  config: ProductionLineConfig;
  runId: string | null;
  baselineRunId: string | null;
  history: ReturnType<typeof useHistoryStore.getState>['history'];
  onCompareRuns: (runIds: string[]) => void;
}) {
  if (!runId || config.intervention === null || !baselineRunId) return null;
  const baselineInHistory = history.some((run) => run.id === baselineRunId);
  if (!baselineInHistory || !history.some((run) => run.id === runId)) return null;

  const previousAttempt = [...history]
    .reverse()
    .find((run) => run.id !== runId && run.config.intervention?.baselineRunId === baselineRunId);
  const ids = previousAttempt ? [baselineRunId, previousAttempt.id, runId] : [baselineRunId, runId];

  return (
    <button
      type="button"
      className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      onClick={() => onCompareRuns(ids)}
    >
      <GitCompare className="size-4" aria-hidden="true" />
      {previousAttempt ? 'Comparar linha de base e as duas últimas tentativas' : 'Comparar com a linha de base'}
    </button>
  );
}

function InterventionForm({
  config,
  baselineRunId,
  onStart,
}: {
  config: ProductionLineConfig;
  baselineRunId: string;
  onStart: (config: ProductionLineConfig) => void;
}) {
  const [target, setTarget] = useState<StageId | ''>('');
  const [added, setAdded] = useState<AddedCapacity>(1);
  const [prediction, setPrediction] = useState('');
  const base = baselineConfigOf(config);
  const baseDiagnosis = diagnoseConstraint(base);

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!target) return;
        onStart(buildInterventionConfig(config, baselineRunId, target, added, prediction));
      }}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <FlaskConical className="size-4" aria-hidden="true" />
        Testar melhoria de capacidade
      </h3>
      <p className="text-sm text-muted-foreground">
        Sugestão: comece comparando a mesma melhoria +1 em dois setores — na restrição e num setor que não é restrição.
        É a mesma magnitude física, não o mesmo custo. Depois, experimente +2 ou +3 na restrição original.
      </p>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-medium">1. Setor que recebe a capacidade adicional</legend>
        {base.stages.map((stage, index) => (
          <label key={stage.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${target === stage.id ? 'border-primary bg-primary/10' : ''}`}>
            <input type="radio" name="intervention-target" className="sr-only" value={stage.id} checked={target === stage.id} onChange={() => setTarget(stage.id)} />
            {index + 1}. {stage.sectorName}{' '}
            <span className="text-xs text-muted-foreground">média {formatNumber(baseDiagnosis.meanByStage[stage.id])}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-medium">2. Acréscimo por dia</legend>
        {([1, 2, 3] as AddedCapacity[]).map((value) => (
          <label key={value} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium ${added === value ? 'border-primary bg-primary/10' : ''}`}>
            <input type="radio" name="intervention-added" className="sr-only" value={value} checked={added === value} onChange={() => setAdded(value)} />
            +{value} {value === 1 ? 'lote' : 'lotes'}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        3. Previsão e justificativa <span className="text-muted-foreground">(opcional) — o que deve mudar na entrega e no estoque?</span>
        <textarea
          className="min-h-16 rounded-md border bg-background px-2 py-1.5"
          maxLength={HYPOTHESIS_MAX_LENGTH}
          value={prediction}
          onChange={(event) => setPrediction(event.target.value)}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        A tentativa recomeça do dia 1, com filas vazias, mesmo horizonte e os mesmos sorteios da linha de base. Melhorias
        de tentativas anteriores não se acumulam.
      </p>
      <button
        type="submit"
        disabled={!target}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        <Play className="size-4" aria-hidden="true" />
        Executar tentativa desde o dia 1
      </button>
    </form>
  );
}
