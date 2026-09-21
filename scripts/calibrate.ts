/**
 * Script de calibração do motor e dos cenários.
 *
 * Executa as quatro estratégias nos cenários A e B, sobre a mesma lista fixa de
 * seeds, e relata mediana, mínimo e máximo de tempo total e de dispersão.
 *
 * É ferramenta de desenvolvimento, não um modo da interface. Serve para
 * identificar comportamento incoerente durante a implementação — por exemplo,
 * um efeito que só aparece em uma seed conveniente. A calibração pedagógica
 * final acontece na etapa do piloto, com um grupo real.
 *
 * Uso: npm run calibrate
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runToEnd } from '../src/features/trail/domain/engine';
import { finalizeResult } from '../src/features/trail/domain/metrics';
import { validateConfig } from '../src/features/trail/domain/validation';
import { createAttemptConfig } from '../src/features/trail/domain/attempt';
import { computeLoadByCharacter } from '../src/features/trail/domain/engine';
import { ENGINE_VERSION } from '../src/features/trail/domain/types';
import { RANDOM_VERSION } from '../src/features/trail/domain/random';
import {
  SCENARIO_A,
  SCENARIO_B,
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  generateExpedition,
} from '../src/features/trail/scenarios';
import type { Scenario } from '../src/features/trail/domain/types';

import { STRATEGIES, type StrategyId } from './calibration/strategies';
import { formatMeters, formatSeconds, summarize, type Summary } from './calibration/stats';

/**
 * Lista fixa de seeds. Não alterar sem registrar a mudança: trocar as seeds
 * invalida a comparação com relatórios anteriores.
 */
const SEEDS: string[] = Array.from({ length: 24 }, (_, index) => `calib-${String(index + 1).padStart(3, '0')}`);

/**
 * Tamanhos de grupo da expedição gerada cobertos por este relatório: os dois
 * extremos aceitos (MIN_PARTY_SIZE, MAX_PARTY_SIZE) e dois pontos
 * intermediários. Não todos os tamanhos possíveis — o objetivo é confirmar
 * que o gerador continua produzindo configurações adequadas fora dos seis
 * personagens dos cenários fixos, não substituir a suíte de testes.
 */
const GENERATED_PARTY_SIZES: number[] = [MIN_PARTY_SIZE, 6, 9, MAX_PARTY_SIZE];

/**
 * Seed fixa que decide QUAL expedição é sorteada para cada tamanho neste
 * relatório — não confundir com `SEEDS` acima, que são as sementes de
 * variabilidade usadas dentro de cada execução já sorteada. Trocar esta seed
 * muda qual expedição é avaliada; registrar a mudança como qualquer outra
 * alteração de calibração (`docs/decisions.md`).
 */
function generatedScenarioSeed(partySize: number): string {
  return `calib-expedicao-${partySize}`;
}

interface RunRecord {
  seed: string;
  outcome: 'completed' | 'timed_out';
  totalTimeSec: number | null;
  maxSpreadM: number;
  meanSpreadM: number;
  collectiveProgressPct: number;
}

interface StrategyReport {
  strategyId: StrategyId;
  label: string;
  description: string;
  order: string[];
  loadKgByCharacter: Record<string, number>;
  runs: RunRecord[];
  completedCount: number;
  timedOutCount: number;
  /** Calculado apenas sobre execuções concluídas. */
  totalTime: Summary;
  maxSpread: Summary;
  meanSpread: Summary;
}

interface ScenarioReport {
  scenarioId: string;
  scenarioRevision: number;
  distanceM: number;
  timeLimitSec: number;
  strategies: StrategyReport[];
}

function evaluateStrategy(scenario: Scenario, strategyIndex: number): StrategyReport {
  const strategy = STRATEGIES[strategyIndex];
  const runs: RunRecord[] = [];

  // Configuração de referência, apenas para registrar ordem e cargas exatas.
  const referenceConfig = strategy.apply(createAttemptConfig(scenario));
  const validation = validateConfig(referenceConfig);

  if (!validation.valid) {
    throw new Error(
      `Estratégia "${strategy.id}" produziu configuração inválida em ${scenario.id}: ` +
        validation.issues.map((issue) => issue.message).join(' | '),
    );
  }

  for (const seed of SEEDS) {
    const config = strategy.apply(createAttemptConfig(scenario, { seed }));
    const state = runToEnd(config);
    const metrics = finalizeResult(config, state);

    runs.push({
      seed,
      outcome: metrics.outcome,
      totalTimeSec: metrics.totalTimeSec,
      maxSpreadM: metrics.maxSpreadM,
      meanSpreadM: metrics.meanSpreadM,
      collectiveProgressPct: metrics.collectiveProgressPct,
    });
  }

  // Timeouts são relatados à parte e não entram nas estatísticas de tempo:
  // uma execução que não terminou não tem tempo de conclusão.
  const completed = runs.filter((run) => run.outcome === 'completed');

  return {
    strategyId: strategy.id,
    label: strategy.label,
    description: strategy.description,
    order: [...referenceConfig.order],
    loadKgByCharacter: computeLoadByCharacter(referenceConfig),
    runs,
    completedCount: completed.length,
    timedOutCount: runs.length - completed.length,
    totalTime: summarize(completed.map((run) => run.totalTimeSec!)),
    maxSpread: summarize(completed.map((run) => run.maxSpreadM)),
    meanSpread: summarize(completed.map((run) => run.meanSpreadM)),
  };
}

function evaluateScenario(scenario: Scenario): ScenarioReport {
  return {
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    distanceM: scenario.distanceM,
    timeLimitSec: scenario.timeLimitSec,
    strategies: STRATEGIES.map((_, index) => evaluateStrategy(scenario, index)),
  };
}

function printScenario(report: ScenarioReport): void {
  console.log('');
  console.log(`═══ Cenário ${report.scenarioId} (revisão ${report.scenarioRevision}) ═══`);
  console.log(`Distância: ${report.distanceM} m · Limite: ${report.timeLimitSec} s · Seeds: ${SEEDS.length}`);
  console.log('');

  const baseline = report.strategies[0];

  for (const strategy of report.strategies) {
    console.log(`── ${strategy.label}`);
    console.log(`   ${strategy.description}`);
    console.log(`   Ordem:  ${strategy.order.join(' → ')}`);
    console.log(
      `   Cargas: ${Object.entries(strategy.loadKgByCharacter)
        .map(([id, kg]) => `${id}=${kg}kg`)
        .join('  ')}`,
    );

    if (strategy.timedOutCount > 0) {
      console.log(`   ATENÇÃO: ${strategy.timedOutCount} de ${SEEDS.length} execuções não concluíram.`);
    }

    console.log(
      `   Tempo total   mediana ${formatSeconds(strategy.totalTime.median)}` +
        `  faixa ${formatSeconds(strategy.totalTime.min)}–${formatSeconds(strategy.totalTime.max)}` +
        `  (${strategy.completedCount} concluídas)`,
    );
    console.log(
      `   Dispersão máx mediana ${formatMeters(strategy.maxSpread.median)}` +
        `  faixa ${formatMeters(strategy.maxSpread.min)}–${formatMeters(strategy.maxSpread.max)}`,
    );
    console.log(
      `   Dispersão méd mediana ${formatMeters(strategy.meanSpread.median)}`,
    );

    // A variação percentual é sempre relativa à configuração inicial do MESMO
    // cenário e da MESMA lista de seeds. Não se compara A com B.
    if (strategy.strategyId !== 'inicial' && baseline.totalTime.median && strategy.totalTime.median) {
      const deltaPct =
        ((baseline.totalTime.median - strategy.totalTime.median) / baseline.totalTime.median) * 100;
      const spreadDelta =
        strategy.maxSpread.median !== null && baseline.maxSpread.median !== null
          ? strategy.maxSpread.median - baseline.maxSpread.median
          : null;

      console.log(
        `   vs. inicial:  tempo ${deltaPct >= 0 ? '−' : '+'}${Math.abs(deltaPct).toFixed(1)}%` +
          (spreadDelta !== null
            ? `  ·  dispersão máx ${spreadDelta >= 0 ? '+' : '−'}${Math.abs(spreadDelta).toFixed(1)} m`
            : ''),
      );
    }

    console.log('');
  }
}

async function evaluateGeneratedScenarios(): Promise<ScenarioReport[]> {
  const reports: ScenarioReport[] = [];

  for (const partySize of GENERATED_PARTY_SIZES) {
    const seed = generatedScenarioSeed(partySize);
    const { scenario, usedReserve, attempts } = await generateExpedition(partySize, seed);

    if (usedReserve) {
      console.log(
        `   (aviso: expedição gerada de ${partySize} pessoas caiu na configuração de reserva ` +
          `após ${attempts} tentativas, para a seed "${seed}")`,
      );
    }

    reports.push(evaluateScenario(scenario));
  }

  return reports;
}

async function main(): Promise<void> {
  console.log('Calibração do Simulador da Trilha');
  console.log(`Motor ${ENGINE_VERSION} · RNG ${RANDOM_VERSION}`);
  console.log(`Seeds fixas: ${SEEDS[0]} … ${SEEDS[SEEDS.length - 1]} (${SEEDS.length})`);
  console.log(`Tamanhos de expedição gerada avaliados: ${GENERATED_PARTY_SIZES.join(', ')}`);

  const fixedReports = [SCENARIO_A, SCENARIO_B].map(evaluateScenario);
  const generatedReports = await evaluateGeneratedScenarios();
  const reports = [...fixedReports, ...generatedReports];

  for (const report of reports) {
    printScenario(report);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    randomVersion: RANDOM_VERSION,
    seeds: SEEDS,
    scenarios: reports,
  };

  const outputDir = resolve(process.cwd(), 'docs', 'calibration');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, `calibration-${ENGINE_VERSION}.json`);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Relatório completo gravado em docs/calibration/calibration-${ENGINE_VERSION}.json`);
  console.log('');
  console.log('Lembrete: estes números são de desenvolvimento. A validação pedagógica');
  console.log('acontece no piloto, com um grupo real.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
