'use client';

/**
 * Desvio acumulado por etapa (guia §8) — inspirado no registro de Alex no
 * livro, incluindo valores negativos. Barras horizontais a partir de uma
 * linha zero central: a favor à direita, contra à esquerda.
 */

import type { ProductionLineConfig } from '../domain/types';
import { stageLabel } from './stageLabel';

interface StageDeviationChartProps {
  config: ProductionLineConfig;
  deviationByStage: Record<string, number>;
}

const WIDTH = 360;
const ROW_HEIGHT = 26;
const LABEL_WIDTH = 140;

export function StageDeviationChart({ config, deviationByStage }: StageDeviationChartProps) {
  const values = config.stages.map((stage) => deviationByStage[stage.id] ?? 0);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const barAreaWidth = WIDTH - LABEL_WIDTH - 16;
  const centerX = LABEL_WIDTH + barAreaWidth / 2;
  const height = config.stages.length * ROW_HEIGHT + 8;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="Desvio acumulado de cada setor em relação à referência pela capacidade média, em lotes. Valores negativos indicam transferência abaixo da referência."
        className="w-full text-muted-foreground"
      >
        <line x1={centerX} y1={0} x2={centerX} y2={height} stroke="currentColor" strokeOpacity={0.25} />
        {config.stages.map((stage, index) => {
          const value = deviationByStage[stage.id] ?? 0;
          const barWidth = (Math.abs(value) / maxAbs) * (barAreaWidth / 2);
          const y = index * ROW_HEIGHT + 4;
          const barX = value >= 0 ? centerX : centerX - barWidth;

          return (
            <g key={stage.id}>
              <text x={0} y={y + ROW_HEIGHT / 2 + 4} fontSize={10} fill="currentColor">
                {stageLabel(stage).length > 22 ? `${stageLabel(stage).slice(0, 21)}…` : stageLabel(stage)}
              </text>
              <rect
                x={barX}
                y={y}
                width={Math.max(1, barWidth)}
                height={ROW_HEIGHT - 8}
                fill={value >= 0 ? '#16a34a' : '#dc2626'}
                opacity={0.85}
              />
              <text
                x={value >= 0 ? centerX + barWidth + 4 : centerX - barWidth - 4}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={9}
                fill="currentColor"
                textAnchor={value >= 0 ? 'start' : 'end'}
              >
                {value >= 0 ? '+' : ''}
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
