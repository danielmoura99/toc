import type { ProductionLineConfig, ProductionLineState } from '../domain/types';
import type { RunSummary } from '../domain/metrics';
import { DeliveredChart } from './DeliveredChart';
import { StageDeviationChart } from './StageDeviationChart';
import { stageLabel } from './stageLabel';

export function RunObservations({ config, state, summary }: {
  config: ProductionLineConfig; state: ProductionLineState; summary: RunSummary;
}) {
  const partial = state.nextStageIndex !== 0;
  return (
    <section aria-label="Observação do fluxo" className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Lotes expedidos', summary.delivered],
          ['Referência pela capacidade média', summary.referenceAccumulated],
          ['Estoque em processo', summary.inventoryRemaining],
          ['Entrada acumulada', state.introduced],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value} <span className="text-sm">lotes</span></dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        {partial ? 'Dia em andamento: estoques e entrada são parciais. Gráficos e referência usam somente os dias encerrados.' : `${state.completedRounds} dias encerrados.`}
        {' '}Saída média nos dias encerrados: {summary.meanOutputPerRound === null ? '—' : `${summary.meanOutputPerRound.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} lotes/dia`}.
        {' '}A referência de 3,5 lotes por dia não é uma promessa de entrega.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Entrega acumulada × referência</h3>
          <DeliveredChart roundAggregates={summary.roundAggregates} totalRounds={config.rounds} />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Desvio acumulado por setor até o último dia encerrado</h3>
          {summary.roundAggregates.length > 0 ? <StageDeviationChart config={config} deviationByStage={summary.roundAggregates.at(-1)!.deviationByStage} /> : <p className="text-sm">Aguardando o primeiro dia encerrar.</p>}
        </div>
      </div>
      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Fechamento por dia</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{['Dia', 'Expedidos no dia', 'Expedidos acumulados', 'Referência acumulada', 'Estoque em processo'].map(h => <th scope="col" className="p-2" key={h}>{h}</th>)}</tr></thead>
            <tbody>{summary.roundAggregates.map(day => <tr key={day.roundIndex} className="border-t">
              <th scope="row" className="p-2">{day.roundIndex + 1}</th>
              <td className="p-2">{day.deliveredThisRound} lotes</td><td className="p-2">{day.deliveredCumulative} lotes</td>
              <td className="p-2">{day.referenceCumulative} lotes</td><td className="p-2">{day.inventoryCumulative} lotes</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Registro das jogadas ({state.events.length})</summary>
        <div className="mt-3 max-h-96 overflow-auto" tabIndex={0} role="region" aria-label="Registro turno a turno">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <caption className="sr-only">Capacidade, material, transferência e estoques após cada jogada.</caption>
            <thead><tr>{['Dia', 'Setor', 'Dado / capacidade', 'Material disponível', 'Transferido', 'Não utilizada', 'Entrada total', 'Expedido total', 'Filas após a jogada'].map(h => <th scope="col" className="p-2" key={h}>{h}</th>)}</tr></thead>
            <tbody>{state.events.map(event => <tr key={`${event.roundIndex}-${event.stageIndex}`} className="border-t">
              <td className="p-2">{event.roundIndex + 1}</td><th scope="row" className="p-2 font-normal">{event.stageIndex + 1}. {stageLabel(config.stages[event.stageIndex])}</th>
              <td className="p-2">{event.die} lotes</td><td className="p-2">{event.availableBefore === null ? 'Fonte irrestrita' : `${event.availableBefore} lotes`}</td>
              <td className="p-2">{event.transferred} lotes</td><td className="p-2">{event.unusedCapacity} lotes</td>
              <td className="p-2">{event.introducedTotal}</td><td className="p-2">{event.deliveredTotal}</td>
              <td className="p-2">{config.stages.slice(1).map((stage, i) => `Setor ${i + 2}: ${event.inventoryAfter[stage.id]} lotes`).join(' · ')}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
