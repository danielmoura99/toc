'use client';

/**
 * Tabela acessível com todas as informações da linha de produção, sem
 * depender do canvas, do mouse ou só de cores (guia §7: "a tabela HTML deve
 * oferecer todas as informações sem depender do canvas").
 */

import type { ProductionLineConfig, ProductionLineState, TurnEvent } from '../domain/types';
import type { RunSummary } from '../domain/metrics';
import { stageLabel } from './stageLabel';

interface StageTableProps {
  config: ProductionLineConfig;
  state: ProductionLineState;
  summary: RunSummary;
  activeStageIndex: number | null;
}

function lastEventForStage(state: ProductionLineState, stageId: string): TurnEvent | null {
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    if (state.events[i].stageId === stageId) return state.events[i];
  }
  return null;
}

export function StageTable({ config, state, summary, activeStageIndex }: StageTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-220 border-collapse text-sm">
        <caption className="p-3 text-left text-sm text-muted-foreground">
          Estado de cada setor da linha de produção, turno a turno.
          {state.nextStageIndex !== 0 && ' Dia parcial: os setores têm quantidades diferentes de jogadas. Compare os desvios no gráfico do último dia encerrado.'}
        </caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="w-52 p-3 font-medium">Setor</th>
            <th scope="col" className="p-3 font-medium">Aguardando</th>
            <th scope="col" className="p-3 font-medium">Último dado</th>
            <th scope="col" className="p-3 font-medium">Último transferido</th>
            <th scope="col" className="p-3 font-medium">Capacidade não utilizada (último)</th>
            <th scope="col" className="p-3 font-medium">Transferência acumulada</th>
            <th scope="col" className="p-3 font-medium">Capacidade sorteada acumulada</th>
            <th scope="col" className="p-3 font-medium">Capacidade não utilizada acumulada</th>
            <th scope="col" className="p-3 font-medium">Jogadas executadas</th>
            <th scope="col" className="p-3 font-medium">Desvio acumulado</th>
          </tr>
        </thead>
        <tbody>
          {config.stages.map((stage, index) => {
            const isActive = index === activeStageIndex;
            const lastEvent = lastEventForStage(state, stage.id);
            const queue = index === 0 ? null : (state.inventoryByStage[stage.id] ?? 0);
            const deviation = summary.deviationByStageFinal[stage.id] ?? 0;

            return (
              <tr
                key={stage.id}
                data-testid={`factory-stage-row-${stage.id}`}
                className={`border-b last:border-0 ${isActive ? 'bg-primary/5' : ''}`}
              >
                <th scope="row" className="p-3 text-left font-medium">
                  {isActive && <span className="mr-1.5 text-primary">▸</span>}
                  {index + 1}. {stageLabel(stage)}
                </th>
                <td className="p-3 tabular-nums">{queue === null ? 'entrada disponível' : `${queue} lotes`}</td>
                <td className="p-3 tabular-nums">{lastEvent ? lastEvent.die : '—'}</td>
                <td className="p-3 tabular-nums">{lastEvent ? lastEvent.transferred : '—'}</td>
                <td className="p-3 tabular-nums">{lastEvent ? lastEvent.unusedCapacity : '—'}</td>
                <td className="p-3 tabular-nums">{summary.transferredByStage[stage.id] ?? 0} lotes</td>
                <td className="p-3 tabular-nums">{summary.capacitySampledByStage[stage.id]} lotes</td>
                <td className="p-3 tabular-nums">{summary.unusedCapacityByStage[stage.id]} lotes</td>
                <td className="p-3 tabular-nums">{state.events.filter(event => event.stageId === stage.id).length}</td>
                <td className={`p-3 tabular-nums ${deviation < 0 ? 'text-destructive' : ''}`}>
                  {deviation >= 0 ? '+' : ''}
                  {deviation.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
