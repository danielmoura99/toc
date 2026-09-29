'use client';

/**
 * Comparação de até três partidas (guia §9). Distingue reprodução, outra
 * realização aleatória e condições diferentes — nunca atribui a diferença a
 * aprendizado quando só a seed muda, e nunca mostra percentual de melhoria
 * controlada quando etapas ou horizonte diferem.
 */

import { ArrowLeft } from 'lucide-react';
import { DeliveredChart } from './DeliveredChart';
import { RunObservations } from './RunObservations';

import { useHistoryStore } from '../application/historyStore';
import { diagnoseConstraint } from '../domain/capacity';
import { EXPERIENCE_LABEL } from '../domain/config';
import { classifyRunRelationship, type RunRelationship } from '../domain/metrics';
import { formatDateTime } from '@/features/trail/components/format';
import { formatLots, formatNumber, formatPercent, formatSigned, interventionLabel, sectorName } from './capacityText';

interface ComparisonPanelProps {
  onBack: () => void;
}

const RELATIONSHIP_LABEL: Record<RunRelationship, string> = {
  reproduction: 'Reprodução — mesma configuração e seed',
  controlled_intervention: 'Intervenção controlada — mesmos sorteios, só a capacidade mudou',
  same_conditions_new_seed: 'Outra realização aleatória — mesma configuração, seed diferente',
  different_conditions: 'Condições diferentes — etapas ou horizonte mudaram',
};

export function ComparisonPanel({ onBack }: ComparisonPanelProps) {
  const history = useHistoryStore((s) => s.history);
  const selectedForComparison = useHistoryStore((s) => s.selectedForComparison);

  const runs = selectedForComparison
    .map((id) => history.find((run) => run.id === id))
    .filter((run): run is NonNullable<typeof run> => run !== undefined)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const reference = runs[0] ?? null;
  const anyConstraintFlow = runs.some((run) => run.config.experience === 'constraint-flow');

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Histórico
      </button>

      {runs.length < 2 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Selecione ao menos duas partidas no histórico para comparar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-220 border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="w-44 p-3 font-medium">Partida</th>
                {runs.map((run, index) => (
                  <th key={run.id} scope="col" className="p-3 font-medium">
                    #{history.findIndex((r) => r.id === run.id) + 1}
                    {index === 0 && <span className="ml-1 text-primary">(referência)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Experiência" values={runs.map((run) => EXPERIENCE_LABEL[run.config.experience])} small />
              {anyConstraintFlow && <Row label="Configuração testada" values={runs.map((run) => interventionLabel(run.config))} />}
              <Row label="Data/hora" values={runs.map((run) => formatDateTime(run.createdAt))} />
              <Row label="Setores" values={runs.map((run) => String(run.config.stages.length))} />
              <Row label="Horizonte" values={runs.map((run) => `${run.config.rounds} dias`)} />
              <Row label="Seed" values={runs.map((run) => run.config.seed.slice(0, 8))} mono />
              <Row label="Entrega" values={runs.map((run) => formatLots(run.summary.delivered))} />
              <Row label="Estoque restante" values={runs.map((run) => formatLots(run.summary.inventoryRemaining))} />
              <Row
                label="Taxa de entrega"
                values={runs.map((run) => (run.summary.meanOutputPerRound === null ? '—' : `${formatNumber(run.summary.meanOutputPerRound, 2)} lotes/dia`))}
              />
              <Row
                label="Referência pela menor capacidade média"
                values={runs.map((run) => `${formatLots(run.summary.referenceAccumulated)} (${formatNumber(run.summary.referenceRatePerRound)}/dia)`)}
              />
              <Row label="Desvio da entrega" values={runs.map((run) => formatSigned(run.summary.deviationDelivered))} />
              {anyConstraintFlow && (
                <>
                  <Row
                    label="Menor capacidade média"
                    values={runs.map((run) => {
                      if (run.config.experience !== 'constraint-flow') return '—';
                      const d = diagnoseConstraint(run.config);
                      const names = d.constrainedStageIds.map((id) => sectorName(run.config, id));
                      return d.isTie ? `Empate: ${names.join(', ')}` : names[0];
                    })}
                    small
                  />
                  <Row
                    label="Restrição original: não utilizada por falta de material"
                    values={runs.map((run) => {
                      const id = run.config.originalConstraintStageId;
                      return id ? `${formatLots(run.summary.unusedCapacityByStage[id])} (${sectorName(run.config, id)})` : '—';
                    })}
                  />
                  <Row
                    label="Restrição original: aproveitamento"
                    values={runs.map((run) => {
                      const id = run.config.originalConstraintStageId;
                      return id ? formatPercent(run.summary.utilizationByStage[id]) : '—';
                    })}
                  />
                </>
              )}
              {reference && (
                <Row
                  label="Relação com a referência"
                  values={runs.map((run, index) =>
                    index === 0 ? '—' : RELATIONSHIP_LABEL[classifyRunRelationship(reference, run)],
                  )}
                  small
                />
              )}
              {reference && (
                <Row
                  label="Diferença de entrega (partida − referência)"
                  values={runs.map((run, index) => {
                    if (index === 0) return '—';
                    const relationship = classifyRunRelationship(reference, run);
                    const delta = formatSigned(run.summary.delivered - reference.summary.delivered);
                    if (relationship === 'different_conditions') {
                      return `${delta} lotes (condições diferentes — sem percentual de melhoria)`;
                    }
                    if (relationship === 'same_conditions_new_seed') {
                      return `${delta} lotes (outra seed: diferença aleatória, não efeito de intervenção)`;
                    }
                    return `${delta} lotes`;
                  })}
                  small
                />
              )}
              {reference && (
                <Row
                  label="Diferença de estoque (partida − referência)"
                  values={runs.map((run, index) =>
                    index === 0 ? '—' : `${formatSigned(run.summary.inventoryRemaining - reference.summary.inventoryRemaining)} lotes`,
                  )}
                  small
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p>
          Nenhuma diferença aqui é atribuída a aprendizado ou estratégia. Entre realizações com outra seed, a
          diferença é variação estatística do próprio dado. Só uma intervenção controlada — mesmos sorteios, só a
          capacidade de um setor mudou — isola o efeito da melhoria; ainda assim, julgue-a pela entrega e pelo
          estoque, não só pelo desvio contra referências diferentes.
        </p>
      </div>
      {runs.length >= 2 && <section aria-label="Curvas das partidas" className="grid gap-4 lg:grid-cols-3">
        {runs.map(run => <article key={run.id} className="min-w-0 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Partida #{history.findIndex(r => r.id === run.id) + 1}</h2>
          <p className="text-sm text-muted-foreground">{run.config.rounds} dias · {run.config.stages.length} setores</p>
          <p className="text-sm font-medium">{interventionLabel(run.config)}</p>
          <DeliveredChart
            roundAggregates={run.summary.roundAggregates}
            totalRounds={run.config.rounds}
            referenceRate={run.summary.referenceRatePerRound}
            experience={run.config.experience}
          />
          <p className="text-xs text-muted-foreground">Escala correspondente ao horizonte desta partida.</p>
          <p className="text-xs">Participantes: {run.config.stages.map((s, i) => `${i + 1}. ${s.participantName || s.sectorName}`).join(' · ')}</p>
        </article>)}
      </section>}
      {runs.map(run => <details key={run.id} className="rounded-lg border p-3">
        <summary className="cursor-pointer">Detalhes da partida #{history.findIndex(r => r.id === run.id) + 1}</summary>
        <RunObservations config={run.config} state={run.finalState} summary={run.summary} />
      </details>)}
    </div>
  );
}

function Row({ label, values, mono, small }: { label: string; values: string[]; mono?: boolean; small?: boolean }) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
        {label}
      </th>
      {values.map((value, index) => (
        <td key={index} className={`p-3 tabular-nums ${mono ? 'font-mono text-xs' : ''} ${small ? 'text-xs' : ''}`}>
          {value}
        </td>
      ))}
    </tr>
  );
}
