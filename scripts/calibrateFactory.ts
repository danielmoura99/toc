/**
 * Script de calibração/verificação estatística da Fábrica de componentes
 * (guia §12, "Verificação estatística de desenvolvimento").
 *
 * 100 seeds fixas, 5 setores nos três horizontes (10/20/30 dias), mais 4 e
 * 12 setores em dez dias. Relata versão, parâmetros, mediana, mínimo/máximo,
 * média de saída, estoques e proporção de partidas abaixo da referência —
 * sem exigir que toda seed entregue menos que a referência nem que a saída
 * caia continuamente: zeros e resultados acima da referência são
 * preservados no relatório, não filtrados.
 *
 * É ferramenta de desenvolvimento, não um modo da interface.
 *
 * Uso: npm run calibrate:factory
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runToEnd } from '../src/features/factory/domain/engine';
import { createProductionLineConfig } from '../src/features/factory/domain/config';
import { summarize } from '../src/features/factory/domain/metrics';
import { RNG_VERSION } from '../src/features/factory/domain/random';
import { ENGINE_VERSION, REFERENCE_CAPACITY_PER_ROUND, type Horizon } from '../src/features/factory/domain/types';

import { summarize as summarizeStats, type Summary } from './calibration/stats';

/** Lista fixa de seeds — trocar invalida a comparação com relatórios anteriores. */
const SEEDS: string[] = Array.from({ length: 100 }, (_, index) => `factory-calib-${String(index + 1).padStart(3, '0')}`);

interface CombinationReport {
  stageCount: number;
  rounds: Horizon;
  seedCount: number;
  referencePerGame: number;
  delivered: Summary;
  meanDelivered: number;
  inventoryRemaining: Summary;
  deliveredZeroCount: number;
  belowReferenceCount: number;
  belowReferenceProportion: number;
  aboveReferenceCount: number;
  aboveReferenceProportion: number;
  atReferenceCount: number;
}

function runCombination(stageCount: number, rounds: Horizon): CombinationReport {
  const deliveredValues: number[] = [];
  const inventoryValues: number[] = [];
  let belowReferenceCount = 0;
  let aboveReferenceCount = 0;
  let atReferenceCount = 0;
  let deliveredZeroCount = 0;

  const referencePerGame = REFERENCE_CAPACITY_PER_ROUND * rounds;

  for (const seed of SEEDS) {
    const config = createProductionLineConfig({ stageCount, rounds, seed });
    const state = runToEnd(config);
    const summary = summarize(config, state);

    deliveredValues.push(summary.delivered);
    inventoryValues.push(summary.inventoryRemaining);
    if (summary.delivered === 0) deliveredZeroCount += 1;
    if (summary.delivered < referencePerGame) belowReferenceCount += 1;
    else if (summary.delivered > referencePerGame) aboveReferenceCount += 1;
    else atReferenceCount += 1;
  }

  const meanDelivered = deliveredValues.reduce((sum, v) => sum + v, 0) / deliveredValues.length;

  return {
    stageCount,
    rounds,
    seedCount: SEEDS.length,
    referencePerGame,
    delivered: summarizeStats(deliveredValues),
    meanDelivered,
    inventoryRemaining: summarizeStats(inventoryValues),
    deliveredZeroCount,
    belowReferenceCount,
    belowReferenceProportion: belowReferenceCount / SEEDS.length,
    aboveReferenceCount,
    aboveReferenceProportion: aboveReferenceCount / SEEDS.length,
    atReferenceCount,
  };
}

function printCombination(report: CombinationReport): void {
  console.log(
    `${report.stageCount} setores · ${report.rounds} dias (referência ${report.referencePerGame} lotes, ` +
      `${report.seedCount} seeds)`,
  );
  console.log(
    `  entrega — mediana ${report.delivered.median} · mín ${report.delivered.min} · máx ${report.delivered.max} · ` +
      `média ${report.meanDelivered.toFixed(2)}`,
  );
  console.log(
    `  estoque restante — mediana ${report.inventoryRemaining.median} · mín ${report.inventoryRemaining.min} · ` +
      `máx ${report.inventoryRemaining.max}`,
  );
  console.log(
    `  abaixo da referência: ${report.belowReferenceCount}/${report.seedCount} ` +
      `(${(report.belowReferenceProportion * 100).toFixed(1)}%) · acima: ${report.aboveReferenceCount} · ` +
      `exatamente na referência: ${report.atReferenceCount} · entregas zero: ${report.deliveredZeroCount}`,
  );
  console.log('');
}

async function main() {
  console.log(`Motor ${ENGINE_VERSION} · RNG ${RNG_VERSION}`);
  console.log(`Parâmetro: referência de capacidade média = ${REFERENCE_CAPACITY_PER_ROUND} lotes/dia (dado justo de 6 faces)`);
  console.log('');

  console.log('═══ Linha padrão de 5 setores, três horizontes ═══');
  console.log('');
  const standardReports = ([10, 20, 30] as Horizon[]).map((rounds) => runCombination(5, rounds));
  standardReports.forEach(printCombination);

  console.log('═══ Extremos de setores (4 e 12), dez dias ═══');
  console.log('');
  const stageCountReports = [4, 12].map((stageCount) => runCombination(stageCount, 10));
  stageCountReports.forEach(printCombination);

  const allReports = [...standardReports, ...stageCountReports];

  const payload = {
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    rngVersion: RNG_VERSION,
    referenceCapacityPerRound: REFERENCE_CAPACITY_PER_ROUND,
    seeds: SEEDS,
    combinations: allReports,
  };

  const outputDir = resolve(process.cwd(), 'docs', 'calibration');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `calibration-factory-${ENGINE_VERSION}.json`);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Relatório completo gravado em docs/calibration/calibration-factory-${ENGINE_VERSION}.json`);
  console.log('');
  console.log('Lembrete: estes números são de desenvolvimento, não validação pedagógica com pessoas.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
