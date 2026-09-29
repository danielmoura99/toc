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
 * Evolução "Restrição e melhoria do fluxo" (§11): 100 seeds × 5 setores × 20
 * dias — linha de base, +1 em cada setor e +2/+3 na restrição original —
 * 800 execuções em 100 grupos PAREADOS (mesmos sorteios dentro do grupo),
 * não 800 cenários independentes. Mais 20 seeds para 4 e 12 setores em
 * 10/30 dias, conferindo invariantes e casos de fronteira.
 *
 * É ferramenta de desenvolvimento, não um modo da interface.
 *
 * Uso: npm run calibrate:factory
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { inventoryInProcess, runToEnd } from '../src/features/factory/domain/engine';
import { buildInterventionConfig, createProductionLineConfig, stageId } from '../src/features/factory/domain/config';
import { constraintIndex, diagnoseConstraint } from '../src/features/factory/domain/capacity';
import { sameDiceSequence, summarize, type RunSummary } from '../src/features/factory/domain/metrics';
import { RNG_VERSION } from '../src/features/factory/domain/random';
import {
  CAPACITY_MODEL_VERSION,
  ENGINE_VERSION,
  REFERENCE_CAPACITY_PER_ROUND,
  type AddedCapacity,
  type Horizon,
  type ProductionLineConfig,
} from '../src/features/factory/domain/types';

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

// ─── Restrição e melhoria do fluxo ──────────────────────────────────────────

const CONSTRAINT_SEEDS: string[] = Array.from({ length: 100 }, (_, i) => `constraint-calib-${String(i + 1).padStart(3, '0')}`);
const BOUNDARY_SEEDS: string[] = Array.from({ length: 20 }, (_, i) => `constraint-boundary-${String(i + 1).padStart(2, '0')}`);

interface Variant {
  key: string;
  label: string;
  targetIndex: number | null;
  added: AddedCapacity | null;
}

function variantsFor(stageCount: number): Variant[] {
  const central = constraintIndex(stageCount);
  const plusOne = Array.from({ length: stageCount }, (_, index): Variant => ({
    key: `+1@${index}`,
    label: `+1 no setor ${index + 1}${index === central ? ' (restrição)' : ''}`,
    targetIndex: index,
    added: 1,
  }));
  return [
    { key: 'base', label: 'Linha de base', targetIndex: null, added: null },
    ...plusOne,
    { key: `+2@${central}`, label: `+2 na restrição (setor ${central + 1})`, targetIndex: central, added: 2 },
    { key: `+3@${central}`, label: `+3 na restrição (setor ${central + 1})`, targetIndex: central, added: 3 },
  ];
}

function configFor(base: ProductionLineConfig, variant: Variant): ProductionLineConfig {
  if (variant.targetIndex === null || variant.added === null) return base;
  return buildInterventionConfig(base, 'calibration-baseline', stageId(variant.targetIndex), variant.added, '');
}

interface VariantOutcome {
  delivered: number;
  inventory: number;
  rate: number;
  constraintUnused: number;
  constraintInsufficientDays: number;
}

function outcomeOf(config: ProductionLineConfig, summary: RunSummary): VariantOutcome {
  const original = config.originalConstraintStageId!;
  return {
    delivered: summary.delivered,
    inventory: summary.inventoryRemaining,
    rate: summary.meanOutputPerRound ?? 0,
    constraintUnused: summary.unusedCapacityByStage[original],
    constraintInsufficientDays: summary.insufficientMaterialTurnsByStage[original],
  };
}

interface Stats extends Summary {
  mean: number;
}

function stats(values: number[]): Stats {
  return { ...summarizeStats(values), mean: values.reduce((sum, v) => sum + v, 0) / values.length };
}

interface VariantReport {
  key: string;
  label: string;
  delivered: Stats;
  inventory: Stats;
  rate: Stats;
  constraintUnused: Stats;
  pairedDeltaDelivered: Stats;
  pairedDeltaInventory: Stats;
  noGainCount: number;
  gainCount: number;
  lossCount: number;
}

function runConstraintExperiment() {
  const variants = variantsFor(5);
  const perSeed: Array<{ seed: string; outcomes: Record<string, VariantOutcome> }> = [];
  let diceMismatches = 0;

  for (const seed of CONSTRAINT_SEEDS) {
    const base = createProductionLineConfig({ experience: 'constraint-flow', stageCount: 5, rounds: 20, seed });
    const baseState = runToEnd(base);
    const outcomes: Record<string, VariantOutcome> = {};
    for (const variant of variants) {
      const config = configFor(base, variant);
      const state = variant.key === 'base' ? baseState : runToEnd(config);
      if (!sameDiceSequence(baseState, state)) diceMismatches += 1;
      outcomes[variant.key] = outcomeOf(config, summarize(config, state));
    }
    perSeed.push({ seed, outcomes });
  }

  const reports: VariantReport[] = variants.map((variant) => {
    const pick = (field: keyof VariantOutcome) => perSeed.map((entry) => entry.outcomes[variant.key][field]);
    const deltas = perSeed.map((entry) => entry.outcomes[variant.key].delivered - entry.outcomes.base.delivered);
    return {
      key: variant.key,
      label: variant.label,
      delivered: stats(pick('delivered')),
      inventory: stats(pick('inventory')),
      rate: stats(pick('rate')),
      constraintUnused: stats(pick('constraintUnused')),
      pairedDeltaDelivered: stats(deltas),
      pairedDeltaInventory: stats(perSeed.map((entry) => entry.outcomes[variant.key].inventory - entry.outcomes.base.inventory)),
      noGainCount: deltas.filter((d) => d === 0).length,
      gainCount: deltas.filter((d) => d > 0).length,
      lossCount: deltas.filter((d) => d < 0).length,
    };
  });

  return { variants, reports, perSeed, diceMismatches, runs: perSeed.length * variants.length };
}

interface BoundaryReport {
  stageCount: number;
  rounds: Horizon;
  seedCount: number;
  runs: number;
  deliveryDecreases: number;
  conservationFailures: number;
  capacityLimitFailures: number;
  diceMismatches: number;
  tieDiagnosisFailures: number;
}

function runBoundaryChecks(stageCount: number, rounds: Horizon): BoundaryReport {
  const variants = variantsFor(stageCount);
  const central = constraintIndex(stageCount);
  const report: BoundaryReport = {
    stageCount,
    rounds,
    seedCount: BOUNDARY_SEEDS.length,
    runs: 0,
    deliveryDecreases: 0,
    conservationFailures: 0,
    capacityLimitFailures: 0,
    diceMismatches: 0,
    tieDiagnosisFailures: 0,
  };

  for (const seed of BOUNDARY_SEEDS) {
    const base = createProductionLineConfig({ experience: 'constraint-flow', stageCount, rounds, seed });
    const baseState = runToEnd(base);
    for (const variant of variants) {
      const config = configFor(base, variant);
      const state = runToEnd(config);
      report.runs += 1;
      if (state.delivered < baseState.delivered) report.deliveryDecreases += 1;
      if (state.introduced !== state.delivered + inventoryInProcess(state)) report.conservationFailures += 1;
      if (state.events.some((e) => e.transferred > e.availableCapacity || e.unusedCapacity !== e.availableCapacity - e.transferred)) {
        report.capacityLimitFailures += 1;
      }
      if (!sameDiceSequence(baseState, state)) report.diceMismatches += 1;

      // Empate esperado só com +2 ou +3 na restrição original (§5).
      const expectedTie = variant.targetIndex === central && (variant.added === 2 || variant.added === 3);
      if (diagnoseConstraint(config).isTie !== expectedTie) report.tieDiagnosisFailures += 1;
    }
  }
  return report;
}

function fmt(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function printVariant(report: VariantReport): void {
  console.log(`${report.label}`);
  console.log(
    `  entrega — média ${fmt(report.delivered.mean)} · mediana ${fmt(report.delivered.median)} · ` +
      `mín ${report.delivered.min} · máx ${report.delivered.max} · taxa média ${fmt(report.rate.mean)} lotes/dia`,
  );
  console.log(
    `  estoque — média ${fmt(report.inventory.mean)} · restrição original, não utilizada por falta de material: ` +
      `média ${fmt(report.constraintUnused.mean)}`,
  );
  if (report.key !== 'base') {
    console.log(
      `  diferença pareada vs base — entrega: média ${fmt(report.pairedDeltaDelivered.mean)} · mediana ` +
        `${fmt(report.pairedDeltaDelivered.median)} · mín ${report.pairedDeltaDelivered.min} · máx ${report.pairedDeltaDelivered.max} | ` +
        `estoque: média ${fmt(report.pairedDeltaInventory.mean)}`,
    );
    console.log(`  seeds com ganho de entrega: ${report.gainCount} · sem ganho: ${report.noGainCount} · com perda: ${report.lossCount}`);
  }
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

  console.log('═══ Restrição e melhoria do fluxo — 5 setores, 20 dias, 100 grupos pareados ═══');
  console.log(`Modelo de capacidade ${CAPACITY_MODEL_VERSION}: bônus 0 na restrição central, 2 nos demais.`);
  console.log('');
  const constraint = runConstraintExperiment();
  constraint.reports.forEach(printVariant);
  console.log(
    `${constraint.runs} execuções em ${CONSTRAINT_SEEDS.length} grupos pareados · execuções com faces divergentes da base: ${constraint.diceMismatches}`,
  );
  console.log('');

  console.log('═══ Fronteira: 4 e 12 setores, 10 e 30 dias, 20 seeds ═══');
  console.log('');
  const boundary = ([4, 12] as const).flatMap((stageCount) =>
    ([10, 30] as Horizon[]).map((rounds) => runBoundaryChecks(stageCount, rounds)),
  );
  for (const report of boundary) {
    console.log(
      `${report.stageCount} setores · ${report.rounds} dias · ${report.runs} execuções — entrega menor que a base: ${report.deliveryDecreases} · ` +
        `conservação: ${report.conservationFailures} · transferido > capacidade: ${report.capacityLimitFailures} · ` +
        `faces divergentes: ${report.diceMismatches} · diagnóstico de empate errado: ${report.tieDiagnosisFailures}`,
    );
  }
  console.log('');

  const payload = {
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    rngVersion: RNG_VERSION,
    referenceCapacityPerRound: REFERENCE_CAPACITY_PER_ROUND,
    seeds: SEEDS,
    combinations: allReports,
    constraintFlow: {
      capacityModelVersion: CAPACITY_MODEL_VERSION,
      stageCount: 5,
      rounds: 20,
      baseProfiles: createProductionLineConfig({ experience: 'constraint-flow', seed: 'profiles' }).capacityProfiles,
      seeds: CONSTRAINT_SEEDS,
      runs: constraint.runs,
      diceMismatches: constraint.diceMismatches,
      variants: constraint.reports,
      perSeed: constraint.perSeed,
      boundarySeeds: BOUNDARY_SEEDS,
      boundary,
    },
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
