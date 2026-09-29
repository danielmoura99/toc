'use client';

/**
 * Tabela acessível com todas as informações da linha de produção, sem
 * depender do canvas, do mouse ou só de cores (guia §7: "a tabela HTML deve
 * oferecer todas as informações sem depender do canvas").
 *
 * Em "Restrição e melhoria do fluxo" o dado é só o componente variável: a
 * tabela mostra a capacidade total e o processamento efetivo separados (§8.2).
 */

import type { ProductionLineConfig, ProductionLineState, TurnEvent } from '../domain/types';
import type { RunSummary } from '../domain/metrics';
import { hadInsufficientMaterial } from '../domain/metrics';
import { profileFor } from '../domain/capacity';
import { stageLabel } from './stageLabel';
import { formatLots, formatNumber, formatPercent, formatSigned } from './capacityText';

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
  const isConstraintFlow = config.experience === 'constraint-flow';

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
            {isConstraintFlow && <th scope="col" className="p-3 font-medium">Capacidade média do setor</th>}
            <th scope="col" className="p-3 font-medium">Aguardando</th>
            <th scope="col" className="p-3 font-medium">{isConstraintFlow ? 'Último dado (componente variável)' : 'Último dado'}</th>
            {isConstraintFlow && <th scope="col" className="p-3 font-medium">Última capacidade disponível</th>}
            <th scope="col" className="p-3 font-medium">Último transferido</th>
            <th scope="col" className="p-3 font-medium">Capacidade não utilizada (último)</th>
            <th scope="col" className="p-3 font-medium">Transferência acumulada</th>
            <th scope="col" className="p-3 font-medium">{isConstraintFlow ? 'Capacidade disponível acumulada' : 'Capacidade sorteada acumulada'}</th>
            <th scope="col" className="p-3 font-medium">Capacidade não utilizada acumulada</th>
            {isConstraintFlow && <th scope="col" className="p-3 font-medium">Aproveitamento</th>}
            {isConstraintFlow && <th scope="col" className="p-3 font-medium">Dias com material insuficiente</th>}
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
            const profile = profileFor(config, stage.id);
            const lacked = lastEvent !== null && hadInsufficientMaterial(lastEvent);

            return (
              <tr
                key={stage.id}
                data-testid={`factory-stage-row-${stage.id}`}
                className={`border-b last:border-0 ${isActive ? 'bg-primary/5' : ''}`}
              >
                <th scope="row" className="p-3 text-left font-medium">
                  {isActive && <span className="mr-1.5 text-primary">▸</span>}
                  {index + 1}. {stageLabel(stage)}
                  {profile.upgrade > 0 && (
                    <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">melhoria +{profile.upgrade}</span>
                  )}
                </th>
                {isConstraintFlow && (
                  <td className="p-3 tabular-nums">{formatNumber(summary.nominalMeanByStage[stage.id])} lotes/dia</td>
                )}
                <td className="p-3 tabular-nums">{queue === null ? 'entrada disponível' : formatLots(queue)}</td>
                <td className="p-3 tabular-nums">{lastEvent ? lastEvent.die : '—'}</td>
                {isConstraintFlow && (
                  <td className="p-3 tabular-nums">
                    {lastEvent ? `${formatLots(lastEvent.availableCapacity)} (${lastEvent.die} + ${profile.baseBonus}${profile.upgrade ? ` + ${profile.upgrade}` : ''})` : '—'}
                  </td>
                )}
                <td className="p-3 tabular-nums">{lastEvent ? lastEvent.transferred : '—'}</td>
                <td className={`p-3 tabular-nums ${lacked ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>
                  {lastEvent ? lastEvent.unusedCapacity : '—'}
                  {lacked && <span className="ml-1 text-xs font-normal">(falta de material)</span>}
                </td>
                <td className="p-3 tabular-nums">{formatLots(summary.transferredByStage[stage.id] ?? 0)}</td>
                <td className="p-3 tabular-nums">{formatLots(summary.capacitySampledByStage[stage.id])}</td>
                <td className="p-3 tabular-nums">{formatLots(summary.unusedCapacityByStage[stage.id])}</td>
                {isConstraintFlow && <td className="p-3 tabular-nums">{formatPercent(summary.utilizationByStage[stage.id])}</td>}
                {isConstraintFlow && (
                  <td className="p-3 tabular-nums">{index === 0 ? '—' : summary.insufficientMaterialTurnsByStage[stage.id]}</td>
                )}
                <td className="p-3 tabular-nums">{state.events.filter(event => event.stageId === stage.id).length}</td>
                <td className={`p-3 tabular-nums ${deviation < 0 ? 'text-destructive' : ''}`}>{formatSigned(deviation)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
