'use client';

/**
 * Gráfico simples (SVG, sem biblioteca) de velocidade disponível × efetiva
 * nos últimos segundos simulados — evolução pedagógica, frente 3 (§5.2).
 * Existe para mostrar RECUPERAÇÃO, não só abertura de espaço: disponibilidade
 * maior não vira avanço quando a fila impede, e a leitura completa desse
 * comportamento já está na tabela (texto), este gráfico só ajuda a enxergá-lo.
 */

export interface SpeedSample {
  tSec: number;
  availableMps: number;
  actualMps: number;
  gapToPredecessorM: number | null;
}

interface SpeedHistoryChartProps {
  samples: SpeedSample[];
  windowSec: number;
}

const WIDTH = 320;
const HEIGHT = 120;
const PADDING = 24;

function mpsToKmh(mps: number): number {
  return mps * 3.6;
}

export function SpeedHistoryChart({ samples, windowSec }: SpeedHistoryChartProps) {
  if (samples.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Aguardando amostras suficientes para o gráfico (últimos {windowSec} s simulados).
      </p>
    );
  }

  const maxKmh =
    Math.max(1, ...samples.map((sample) => Math.max(mpsToKmh(sample.availableMps), mpsToKmh(sample.actualMps)))) *
    1.1;
  const minT = samples[0].tSec;
  const maxT = samples[samples.length - 1].tSec;
  const spanT = Math.max(1, maxT - minT);

  const x = (tSec: number) => PADDING + ((tSec - minT) / spanT) * (WIDTH - PADDING * 2);
  const y = (kmh: number) => HEIGHT - PADDING - (kmh / maxKmh) * (HEIGHT - PADDING * 2);

  const availablePoints = samples.map((sample) => `${x(sample.tSec)},${y(mpsToKmh(sample.availableMps))}`).join(' ');
  const actualPoints = samples.map((sample) => `${x(sample.tSec)},${y(mpsToKmh(sample.actualMps))}`).join(' ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Velocidade disponível e efetiva nos últimos ${Math.round(spanT)} segundos simulados, em quilômetros por hora.`}
        className="w-full text-muted-foreground"
      >
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        <text x={PADDING} y={PADDING - 8} fontSize={9} fill="currentColor" opacity={0.7}>
          {maxKmh.toFixed(1)} km/h
        </text>
        <text x={PADDING} y={HEIGHT - PADDING + 12} fontSize={9} fill="currentColor" opacity={0.7}>
          0 km/h
        </text>
        <polyline points={availablePoints} fill="none" stroke="#94a3b8" strokeWidth={2} />
        <polyline points={actualPoints} fill="none" stroke="#2563eb" strokeWidth={2} />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-slate-400" aria-hidden="true" />
          Disponível
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-primary" aria-hidden="true" />
          Efetiva
        </span>
        <span className="ml-auto">km/h · últimos {Math.round(spanT)} s simulados</span>
      </div>
    </div>
  );
}
