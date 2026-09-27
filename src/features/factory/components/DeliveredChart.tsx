'use client';

/**
 * Gráfico simples (SVG, sem biblioteca) de saída acumulada × referência
 * `3,5 × rodada` (guia §8) — eixo em lotes, eixo horizontal em dias
 * simulados, um ponto por rodada concluída.
 */

import type { RoundAggregate } from '../domain/metrics';
import { REFERENCE_CAPACITY_PER_ROUND } from '../domain/types';

interface DeliveredChartProps {
  roundAggregates: RoundAggregate[];
  totalRounds: number;
}

const WIDTH = 360;
const HEIGHT = 140;
const PADDING = 28;

export function DeliveredChart({ roundAggregates, totalRounds }: DeliveredChartProps) {
  if (roundAggregates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Aguardando a primeira rodada concluir para desenhar o gráfico.</p>
    );
  }

  const maxDelivered = Math.max(
    ...roundAggregates.map((r) => r.deliveredCumulative),
    REFERENCE_CAPACITY_PER_ROUND * totalRounds,
  ) * 1.1 || 1;

  const x = (roundNumber: number) => PADDING + (roundNumber / totalRounds) * (WIDTH - PADDING * 2);
  const y = (delivered: number) => HEIGHT - PADDING - (delivered / maxDelivered) * (HEIGHT - PADDING * 2);

  const deliveredPoints = [`${x(0)},${y(0)}`, ...roundAggregates.map((r) => `${x(r.roundIndex + 1)},${y(r.deliveredCumulative)}`)].join(' ');
  const referencePoints = `${x(0)},${y(0)} ${x(totalRounds)},${y(REFERENCE_CAPACITY_PER_ROUND * totalRounds)}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Entrega acumulada e referência pela capacidade média ao longo de ${totalRounds} dias simulados, em lotes.`}
        className="w-full text-muted-foreground"
      >
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="currentColor" strokeOpacity={0.25} />
        <line x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} stroke="currentColor" strokeOpacity={0.25} />
        <text x={WIDTH - PADDING} y={HEIGHT - 8} textAnchor="end" fontSize={10} fill="currentColor">{totalRounds} dias simulados</text>
        <text x={PADDING} y={PADDING - 8} fontSize={9} fill="currentColor" opacity={0.7}>
          {maxDelivered.toFixed(0)} lotes
        </text>
        <text x={PADDING} y={HEIGHT - PADDING + 12} fontSize={9} fill="currentColor" opacity={0.7}>
          0
        </text>
        <polyline points={referencePoints} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" />
        <polyline points={deliveredPoints} fill="none" stroke="#2563eb" strokeWidth={2} />
        {roundAggregates.map(r => <circle key={r.roundIndex} cx={x(r.roundIndex + 1)} cy={y(r.deliveredCumulative)} r={2} fill="#2563eb"><title>Dia {r.roundIndex + 1}: {r.deliveredCumulative} lotes expedidos</title></circle>)}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-blue-600" aria-hidden="true" />
          Entrega acumulada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-slate-400" aria-hidden="true" />
          Referência pela capacidade média (3,5 × rodada)
        </span>
        <span className="ml-auto">lotes · {totalRounds} dias simulados</span>
      </div>
    </div>
  );
}
