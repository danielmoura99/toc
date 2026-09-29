'use client';

/**
 * Preparação da partida (guia §7): quantidade de setores, participantes,
 * horizonte, previsão de lotes expedidos e hipótese opcional.
 */

import { useState } from 'react';
import { History, Play } from 'lucide-react';

import { usePreparationStore } from '../application/preparationStore';
import { useHistoryStore } from '../application/historyStore';
import { useRunStore } from '../application/runStore';
import { HYPOTHESIS_MAX_LENGTH, validateConfig } from '../domain/validation';
import { MAX_STAGE_COUNT, MIN_STAGE_COUNT, REFERENCE_CAPACITY_PER_ROUND, type Experience, type Horizon } from '../domain/types';
import type { ProductionLineConfig } from '../domain/types';
import { EXPERIENCE_LABEL } from '../domain/config';
import { nominalMeanCapacity, profileFor } from '../domain/capacity';
import { formatNumber } from './capacityText';

const EXPERIENCE_DESCRIPTION: Record<Experience, string> = {
  'dependency-variability':
    'Todos os setores com o mesmo dado de seis faces. Observe como dependência e variação afetam a entrega.',
  'constraint-flow':
    'Um setor com menor capacidade média. Identifique a restrição, teste uma melhoria com os mesmos sorteios e compare a entrega.',
};

const HORIZON_OPTIONS: Horizon[] = [10, 20, 30];

interface PreparationProps {
  onStart: (config: ProductionLineConfig) => void;
  onViewHistory: () => void;
}

export function Preparation({ onStart, onViewHistory }: PreparationProps) {
  const draft = usePreparationStore((s) => s.draft);
  const prediction = usePreparationStore((s) => s.prediction);
  const setStageCount = usePreparationStore((s) => s.setStageCount);
  const setRounds = usePreparationStore((s) => s.setRounds);
  const setParticipantName = usePreparationStore((s) => s.setParticipantName);
  const setHypothesis = usePreparationStore((s) => s.setHypothesis);
  const setPrediction = usePreparationStore((s) => s.setPrediction);
  const newRunConfig = usePreparationStore((s) => s.newRunConfig);
  const setExperience = usePreparationStore((s) => s.setExperience);
  const isConstraintFlow = draft.experience === 'constraint-flow';

  const historyCount = useHistoryStore((s) => s.history.length);
  const pendingRun = useHistoryStore((s) => s.pendingRun);
  const activeRun = useRunStore((s) => s.state);

  const [predictionInput, setPredictionInput] = useState(prediction === null ? '' : String(prediction));

  const hasActiveRun = activeRun !== null && activeRun.status !== 'completed';
  const validation = validateConfig(draft);

  const handleStart = () => {
    if (!validation.valid || pendingRun) return;
    onStart(newRunConfig());
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Fábrica de componentes</h2>
        {historyCount > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={onViewHistory}
          >
            <History className="size-4" aria-hidden="true" />
            Histórico ({historyCount})
          </button>
        )}
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Experiência</legend>
        {(['dependency-variability', 'constraint-flow'] as Experience[]).map((experience) => (
          <label
            key={experience}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 ${
              draft.experience === experience ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              name="factory-experience"
              className="sr-only"
              value={experience}
              checked={draft.experience === experience}
              onChange={() => setExperience(experience)}
            />
            <span className="font-semibold">{EXPERIENCE_LABEL[experience]}</span>
            <span className="text-sm text-muted-foreground">{EXPERIENCE_DESCRIPTION[experience]}</span>
          </label>
        ))}
      </fieldset>

      <p className="rounded-lg border bg-card p-4 text-sm">
        Cada dia, os setores atuam em sequência. A simulação representa fluxo e capacidade,
        não prazos reais de fabricação. Um lote pode passar por vários setores no mesmo dia.
        {isConstraintFlow
          ? ' Todos os setores variam com o mesmo dado de seis faces; alguns têm capacidade adicional estrutural, que não é sorteio.'
          : ' Todos usam o mesmo dado de seis faces; o nome do setor não muda as regras.'}
      </p>

      {isConstraintFlow && (
        <div className="overflow-x-auto rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Capacidades dos setores</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Capacidade disponível hoje = dado (1 a 6) + capacidade adicional do setor. Consultável desde o início.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="p-2 font-medium">Setor</th>
                <th scope="col" className="p-2 font-medium">Capacidade adicional</th>
                <th scope="col" className="p-2 font-medium">Capacidade diária</th>
                <th scope="col" className="p-2 font-medium">Capacidade média do setor</th>
              </tr>
            </thead>
            <tbody>
              {draft.stages.map((stage, index) => {
                const bonus = profileFor(draft, stage.id).baseBonus;
                return (
                  <tr key={stage.id} className="border-b last:border-0">
                    <th scope="row" className="p-2 text-left font-medium">{index + 1}. {stage.sectorName}</th>
                    <td className="p-2 tabular-nums">+{bonus}</td>
                    <td className="p-2 tabular-nums">{1 + bonus} a {6 + bonus} lotes</td>
                    <td className="p-2 tabular-nums">{formatNumber(nominalMeanCapacity(draft, stage.id))} lotes/dia</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasActiveRun && (
        <div role="status" className="rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          Há uma partida em andamento, recuperada pausada. Abra a execução para continuar, ou comece uma nova —
          a partida em andamento continua salva até você decidir.
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Quantidade de setores</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Padrão de cinco, como no trecho do livro — Usinagem, Tratamento superficial, Pintura, Inspeção,
          Expedição. De {MIN_STAGE_COUNT} a {MAX_STAGE_COUNT} para acomodar o grupo.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={MIN_STAGE_COUNT}
            max={MAX_STAGE_COUNT}
            value={draft.stages.length}
            onChange={(e) => setStageCount(Number(e.target.value))}
            className="w-48"
            aria-label="Quantidade de setores"
          />
          <span className="w-6 text-sm font-medium tabular-nums">{draft.stages.length}</span>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Participantes</h3>
        <p className="mt-1 text-xs text-muted-foreground">Nomes opcionais — nomes repetidos são permitidos e distinguidos pelo setor.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {draft.stages.map((stage, index) => (
            <li key={stage.id} className="flex items-center gap-3">
              <span className="w-52 shrink-0 text-sm">
                <span className="text-muted-foreground">{index + 1}.</span> {stage.sectorName}
              </span>
              <label className="flex-1">
                <span className="sr-only">Nome de quem representa {stage.sectorName}</span>
                <input
                  type="text"
                  className="w-full max-w-64 rounded-md border bg-background px-2 py-1 text-sm"
                  placeholder="Participante (opcional)"
                  value={stage.participantName}
                  maxLength={40}
                  onChange={(e) => setParticipantName(stage.id, e.target.value)}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">
          Horizonte{isConstraintFlow && <span className="font-normal text-muted-foreground"> — recomendado: 20 dias</span>}
        </h3>
        <div className="mt-3 flex gap-2">
          {HORIZON_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                draft.rounds === h ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
              }`}
              onClick={() => setRounds(h)}
            >
              {h} dias
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Previsão</h3>
        <p className="mt-1 text-sm">
          {isConstraintFlow
            ? `Com as capacidades médias da tabela acima, quantos lotes esperamos expedir em ${draft.rounds} dias?`
            : `Se cada setor pode processar em média ${REFERENCE_CAPACITY_PER_ROUND} lotes por dia, quantos lotes esperamos expedir em ${draft.rounds} dias?`}
        </p>
        <input
          type="number"
          aria-label="Previsão de lotes expedidos"
          min={0}
          className="mt-3 w-32 rounded-md border bg-background px-2 py-1 text-sm"
          placeholder="Lotes"
          value={predictionInput}
          onChange={(e) => {
            setPredictionInput(e.target.value);
            const parsed = e.target.value.trim() === '' ? null : Number(e.target.value);
            setPrediction(parsed !== null && Number.isFinite(parsed) ? parsed : null);
          }}
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">
          Hipótese do grupo <span className="font-normal text-muted-foreground">(opcional)</span>
        </h3>
        <textarea
          aria-label="Hipótese do grupo"
          className="mt-2 w-full min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm"
          placeholder="O que vocês esperam observar nesta partida? Por quê?"
          value={draft.hypothesis}
          maxLength={HYPOTHESIS_MAX_LENGTH}
          onChange={(e) => setHypothesis(e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {draft.hypothesis.length} / {HYPOTHESIS_MAX_LENGTH}
        </p>
      </div>

      {!validation.valid && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <ul className="list-inside list-disc">
            {validation.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          onClick={handleStart}
          disabled={!validation.valid || !!pendingRun}
        >
          <Play className="size-4" aria-hidden="true" />
          Iniciar partida
        </button>
      </div>
    </div>
  );
}
