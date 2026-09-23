/**
 * Script de calibração do motor e dos cenários.
 *
 * Executa as cinco estratégias nos cenários A e B e em expedições geradas,
 * sobre a mesma lista fixa de seeds, e relata mediana, mínimo e máximo de
 * tempo total e de dispersão. Também isola quatro fenômenos separadamente
 * (heterogeneidade sem variabilidade, flutuação com capacidades próximas,
 * recuperação de espaço, mudança da candidata à restrição) e os pares
 * com/sem variabilidade da configuração inicial e da redistribuída —
 * evolução pedagógica, frente 4.
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

import { createInitialState, runToEnd, step } from '../src/features/trail/domain/engine';
import { finalizeResult } from '../src/features/trail/domain/metrics';
import { validateConfig } from '../src/features/trail/domain/validation';
import { diagnoseCapacity, sameCandidateSet } from '../src/features/trail/domain/diagnosis';
import { createAttemptConfig } from '../src/features/trail/domain/attempt';
import { computeLoadByCharacter } from '../src/features/trail/domain/engine';
import { DEFAULT_FATIGUE_PARAMS } from '../src/features/trail/domain/fatigue';
import { computeFatigueDiagnosisEvents } from '../src/features/trail/domain/fatigueDiagnosisEvents';
import { ENGINE_VERSION } from '../src/features/trail/domain/types';
import { RANDOM_VERSION } from '../src/features/trail/domain/random';
import {
  SCENARIO_A,
  SCENARIO_B,
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  generateExpedition,
} from '../src/features/trail/scenarios';
import { buildScenario } from '../src/features/trail/scenarios/builder';
import type { AttemptConfig, Scenario } from '../src/features/trail/domain/types';

import { STRATEGIES, type StrategyId } from './calibration/strategies';
import { formatMeters, formatSeconds, summarize, type Summary } from './calibration/stats';

/**
 * Lista fixa de seeds de SIMULAÇÃO (flutuação de ritmo) — não confundir com a
 * seed de GERAÇÃO (`generatedScenarioSeed`), que decide os atributos de uma
 * expedição sorteada. Não alterar sem registrar a mudança: trocar as seeds
 * invalida a comparação com relatórios anteriores.
 */
const SEEDS: string[] = Array.from({ length: 24 }, (_, index) => `calib-${String(index + 1).padStart(3, '0')}`);

/**
 * Tamanhos de grupo da expedição gerada cobertos por este relatório: os dois
 * extremos aceitos (MIN_PARTY_SIZE, MAX_PARTY_SIZE) e dois pontos
 * intermediários. Três expedições sorteadas INDEPENDENTEMENTE por tamanho
 * (§6.3) — não a mesma expedição repetida, e não todos os tamanhos possíveis:
 * o objetivo é confirmar que o gerador continua produzindo configurações
 * adequadas fora dos seis personagens dos cenários fixos, não substituir a
 * suíte de testes.
 */
const GENERATED_PARTY_SIZES: number[] = [MIN_PARTY_SIZE, 6, 9, MAX_PARTY_SIZE];
const GENERATED_EXPEDITIONS_PER_SIZE = 3;

function generatedScenarioSeed(partySize: number, index: number): string {
  return `calib-expedicao-${partySize}-${index}`;
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
  /** Config de referência (seed padrão), para reaproveitar em checagens fora deste laço (§6.3: "reaproveitando execuções equivalentes"). */
  referenceConfig: AttemptConfig;
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
    referenceConfig,
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

interface GeneratedScenarioEntry {
  report: ScenarioReport;
  generationSeed: string;
  usedReserve: boolean;
}

async function evaluateGeneratedScenarios(): Promise<GeneratedScenarioEntry[]> {
  const entries: GeneratedScenarioEntry[] = [];

  for (const partySize of GENERATED_PARTY_SIZES) {
    for (let index = 0; index < GENERATED_EXPEDITIONS_PER_SIZE; index += 1) {
      const seed = generatedScenarioSeed(partySize, index);
      const { scenario, usedReserve, attempts } = await generateExpedition(partySize, seed);

      if (usedReserve) {
        console.log(
          `   (aviso: expedição gerada de ${partySize} pessoas caiu na configuração de reserva ` +
            `após ${attempts} tentativas, para a seed "${seed}")`,
        );
      }

      entries.push({ report: evaluateScenario(scenario), generationSeed: seed, usedReserve });
    }
  }

  return entries;
}

// ───────────────────────────────────────────────────────────────────────────
// Pares com/sem variabilidade (§6.3: isolar o mecanismo da variabilidade das
// diferenças de capacidade, reaproveitando as execuções COM variabilidade já
// feitas em `evaluateStrategy` — só a condição SEM roda de novo, uma vez só,
// porque o resultado sem variabilidade não depende de seed).
// ───────────────────────────────────────────────────────────────────────────

interface VariabilityPairReport {
  scenarioId: string;
  /** Qual das cinco estratégias fornece o lado "com variabilidade". */
  configLabel: 'inicial' | 'redistribuir';
  withoutVariability: { outcome: string; totalTimeSec: number | null; maxSpreadM: number; meanSpreadM: number };
  withVariabilityRunCount: number;
  withVariabilityTimedOutCount: number;
  /** com − sem, só para seeds concluídas dos dois lados. */
  timeDeltaSec: Summary;
  maxSpreadDeltaM: Summary;
}

function evaluateVariabilityPair(
  scenarioId: string,
  strategyReport: StrategyReport,
  configLabel: VariabilityPairReport['configLabel'],
): VariabilityPairReport {
  const withoutConfig: AttemptConfig = { ...strategyReport.referenceConfig, variabilityMode: 'disabled' };
  const withoutState = runToEnd(withoutConfig);
  const withoutMetrics = finalizeResult(withoutConfig, withoutState);

  const timeDeltas: number[] = [];
  const spreadDeltas: number[] = [];

  if (withoutMetrics.outcome === 'completed') {
    for (const run of strategyReport.runs) {
      if (run.outcome !== 'completed') continue;
      timeDeltas.push(run.totalTimeSec! - withoutMetrics.totalTimeSec!);
      spreadDeltas.push(run.maxSpreadM - withoutMetrics.maxSpreadM);
    }
  }

  return {
    scenarioId,
    configLabel,
    withoutVariability: {
      outcome: withoutMetrics.outcome,
      totalTimeSec: withoutMetrics.totalTimeSec,
      maxSpreadM: withoutMetrics.maxSpreadM,
      meanSpreadM: withoutMetrics.meanSpreadM,
    },
    withVariabilityRunCount: strategyReport.completedCount,
    withVariabilityTimedOutCount: strategyReport.timedOutCount,
    timeDeltaSec: summarize(timeDeltas),
    maxSpreadDeltaM: summarize(spreadDeltas),
  };
}

function printVariabilityPair(pair: VariabilityPairReport): void {
  console.log(`── ${pair.scenarioId} · ${pair.configLabel} · com − sem variabilidade`);
  console.log(
    `   Sem variabilidade (1 execução, resultado independente de seed): ` +
      `${pair.withoutVariability.outcome === 'completed' ? formatSeconds(pair.withoutVariability.totalTimeSec) : 'timeout'}` +
      `  ·  dispersão máx ${formatMeters(pair.withoutVariability.maxSpreadM)}`,
  );
  if (pair.withVariabilityTimedOutCount > 0) {
    console.log(
      `   ATENÇÃO: ${pair.withVariabilityTimedOutCount} de ` +
        `${pair.withVariabilityRunCount + pair.withVariabilityTimedOutCount} execuções com variabilidade não concluíram.`,
    );
  }
  console.log(
    `   Diferença observada (com − sem), ${pair.timeDeltaSec.count} pares concluídos dos dois lados:`,
  );
  console.log(
    `     tempo   mediana ${formatSeconds(pair.timeDeltaSec.median)}` +
      `  faixa ${formatSeconds(pair.timeDeltaSec.min)}–${formatSeconds(pair.timeDeltaSec.max)}`,
  );
  console.log(
    `     disp.máx mediana ${formatMeters(pair.maxSpreadDeltaM.median)}` +
      `  faixa ${formatMeters(pair.maxSpreadDeltaM.min)}–${formatMeters(pair.maxSpreadDeltaM.max)}`,
  );
  console.log('');
}

// ───────────────────────────────────────────────────────────────────────────
// Quatro fenômenos separados (§6.2) — fixtures de calibração, não roteiros
// inseridos nas partidas reais.
// ───────────────────────────────────────────────────────────────────────────

interface PedagogicalChecksReport {
  heterogeneitySansVariability: {
    scenarioId: string;
    maxSpreadM: number;
    ok: boolean;
  };
  closeCapacitiesFluctuation: {
    referenceWithoutVariability: { maxSpreadM: number; ok: boolean };
    seedsWithSpread: number;
    seedsEvaluated: number;
    ok: boolean;
  };
  recovery: {
    seedTried: string[];
    seedFound: string | null;
    maxGapM: number | null;
    finalGapM: number | null;
    ok: boolean;
  };
  candidateChangesOnRedistribution: {
    scenariosEvaluated: number;
    scenariosWithChange: number;
    details: Array<{ scenarioId: string; before: string[]; after: string[]; changed: boolean }>;
  };
}

/** Fixture de capacidades iguais: mesma velocidade e carga para todos — só a flutuação (ou não) diferencia. */
function equalCapacityFixtureScenario(variability: number): Scenario {
  const count = 4;
  return buildScenario({
    id: `lab-capacidades-iguais-v${variability}`,
    revision: 1,
    distanceM: 3000,
    timeLimitSec: 14400,
    defaultSeed: 'lab-capacidades-iguais',
    characters: Array.from({ length: count }, (_, i) => ({
      id: `c${i + 1}`,
      displayName: `Lab ${i + 1}`,
      baseSpeedKmh: 4.5,
      referenceLoadKg: 10,
      variability,
    })),
    initialOrder: Array.from({ length: count }, (_, i) => `c${i + 1}`),
    initialLoadKgByCharacter: Object.fromEntries(Array.from({ length: count }, (_, i) => [`c${i + 1}`, 6])),
  });
}

/** Fixture de recuperação: dois personagens, mesma velocidade média, variabilidade alta — abre e fecha espaço quando o de trás alterna abaixo/acima do de frente. */
function recoveryFixtureScenario(): Scenario {
  return buildScenario({
    id: 'lab-recuperacao',
    revision: 1,
    distanceM: 4000,
    timeLimitSec: 14400,
    defaultSeed: 'lab-recuperacao',
    characters: [
      { id: 'frente', displayName: 'Frente', baseSpeedKmh: 4.5, referenceLoadKg: 10, variability: 0.4 },
      { id: 'atras', displayName: 'Atrás', baseSpeedKmh: 4.5, referenceLoadKg: 10, variability: 0.4 },
    ],
    initialOrder: ['frente', 'atras'],
    initialLoadKgByCharacter: { frente: 6, atras: 6 },
  });
}

/** Série de espaço (posição do da frente − posição do de trás) a cada tick, para a fixture de 2 personagens. */
function gapSeries(config: AttemptConfig): number[] {
  const [frontId, backId] = config.order;
  let state = createInitialState(config);
  const series: number[] = [0];

  while (state.status === 'running') {
    state = step(config, state);
    series.push(state.characters[frontId].positionM - state.characters[backId].positionM);
  }

  return series;
}

/** Abriu (pico acima do limiar) e depois reduziu de verdade (não só ruído) — recuperação genuína, não um mínimo instantâneo. */
function findsRecovery(series: number[], minGapM: number, reductionRatio: number): { maxGapM: number; finalGapM: number } | null {
  let maxGapM = 0;
  let maxIndex = 0;

  for (let i = 0; i < series.length; i += 1) {
    if (series[i] > maxGapM) {
      maxGapM = series[i];
      maxIndex = i;
    }
  }

  if (maxGapM < minGapM) return null;

  const afterPeak = series.slice(maxIndex);
  const minAfterPeak = Math.min(...afterPeak);

  if (minAfterPeak > maxGapM * (1 - reductionRatio)) return null;

  return { maxGapM, finalGapM: series[series.length - 1] };
}

function runPedagogicalChecks(): PedagogicalChecksReport {
  // 1) Heterogeneidade sem variabilidade: cenário A, variabilidade desligada.
  const noVarConfig: AttemptConfig = { ...createAttemptConfig(SCENARIO_A), variabilityMode: 'disabled' };
  const noVarState = runToEnd(noVarConfig);
  const heterogeneitySansVariability = {
    scenarioId: SCENARIO_A.id,
    maxSpreadM: noVarState.maxSpreadM,
    ok: noVarState.status === 'completed' && noVarState.maxSpreadM > 0,
  };

  // 2) Flutuação e dependência: capacidades iguais, com e sem variabilidade.
  const equalNoVar = equalCapacityFixtureScenario(0);
  const equalNoVarConfig: AttemptConfig = { ...createAttemptConfig(equalNoVar), variabilityMode: 'disabled' };
  const equalNoVarState = runToEnd(equalNoVarConfig);
  const referenceWithoutVariability = {
    maxSpreadM: equalNoVarState.maxSpreadM,
    ok: equalNoVarState.status === 'completed' && equalNoVarState.maxSpreadM < 1e-6,
  };

  const equalWithVar = equalCapacityFixtureScenario(0.3);
  let seedsWithSpread = 0;
  const sampleSeeds = SEEDS.slice(0, 12);
  for (const seed of sampleSeeds) {
    const state = runToEnd(createAttemptConfig(equalWithVar, { seed }));
    if (state.status === 'completed' && state.maxSpreadM > 5) seedsWithSpread += 1;
  }

  const closeCapacitiesFluctuation = {
    referenceWithoutVariability,
    seedsWithSpread,
    seedsEvaluated: sampleSeeds.length,
    ok: referenceWithoutVariability.ok && seedsWithSpread > 0,
  };

  // 3) Recuperação: busca uma seed em que o espaço abre e depois reduz de verdade.
  const recoveryScenario = recoveryFixtureScenario();
  const seedTried: string[] = [];
  let recoveryFound: { seed: string; maxGapM: number; finalGapM: number } | null = null;

  for (const seed of SEEDS) {
    seedTried.push(seed);
    const config = createAttemptConfig(recoveryScenario, { seed });
    const series = gapSeries(config);
    const found = findsRecovery(series, 80, 0.4);
    if (found) {
      recoveryFound = { seed, ...found };
      break;
    }
  }

  const recovery = {
    seedTried,
    seedFound: recoveryFound?.seed ?? null,
    maxGapM: recoveryFound?.maxGapM ?? null,
    finalGapM: recoveryFound?.finalGapM ?? null,
    ok: recoveryFound !== null,
  };

  // 4) Redistribuição e mudança da candidata à restrição.
  const candidateScenarios = [SCENARIO_A, SCENARIO_B];
  const details = candidateScenarios.map((scenario) => {
    const baseline = createAttemptConfig(scenario);
    const redistributed = STRATEGIES.find((s) => s.id === 'carga')!.apply(baseline);
    const before = diagnoseCapacity(baseline).candidateIds;
    const after = diagnoseCapacity(redistributed).candidateIds;
    return { scenarioId: scenario.id, before, after, changed: !sameCandidateSet(before, after) };
  });

  const candidateChangesOnRedistribution = {
    scenariosEvaluated: details.length,
    scenariosWithChange: details.filter((d) => d.changed).length,
    details,
  };

  return {
    heterogeneitySansVariability,
    closeCapacitiesFluctuation,
    recovery,
    candidateChangesOnRedistribution,
  };
}

function printPedagogicalChecks(report: PedagogicalChecksReport): void {
  console.log('');
  console.log('═══ Fenômenos separados (§6.2) ═══');
  console.log('');

  console.log('── 1) Heterogeneidade sem variabilidade');
  console.log(
    `   ${report.heterogeneitySansVariability.scenarioId}, variabilidade desligada: ` +
      `dispersão máx ${formatMeters(report.heterogeneitySansVariability.maxSpreadM)} — ` +
      `${report.heterogeneitySansVariability.ok ? 'forma espaço mesmo sem variação' : 'ATENÇÃO: não formou espaço'}`,
  );
  console.log('');

  console.log('── 2) Flutuação e dependência (capacidades próximas)');
  console.log(
    `   Fixture de referência, capacidades iguais, sem variação: dispersão máx ` +
      `${formatMeters(report.closeCapacitiesFluctuation.referenceWithoutVariability.maxSpreadM)} — ` +
      `${report.closeCapacitiesFluctuation.referenceWithoutVariability.ok ? 'anda junto, como esperado' : 'ATENÇÃO: deveria andar junto'}`,
  );
  console.log(
    `   Mesma fixture, com variação: ${report.closeCapacitiesFluctuation.seedsWithSpread} de ` +
      `${report.closeCapacitiesFluctuation.seedsEvaluated} seeds formaram dispersão perceptível`,
  );
  console.log('');

  console.log('── 3) Recuperação de espaço (fixture de teste, não roteiro em partidas reais)');
  if (report.recovery.seedFound) {
    console.log(
      `   Seed "${report.recovery.seedFound}" (de ${report.recovery.seedTried.length} testadas): ` +
        `espaço abriu até ${formatMeters(report.recovery.maxGapM)} e reduziu — final ${formatMeters(report.recovery.finalGapM)}`,
    );
  } else {
    console.log(
      `   ATENÇÃO: nenhuma das ${report.recovery.seedTried.length} seeds testadas mostrou abertura seguida ` +
        'de redução clara do espaço — revisar a fixture ou os limiares antes de assumir o efeito.',
    );
  }
  console.log('');

  console.log('── 4) Redistribuição e mudança da candidata à restrição');
  for (const detail of report.candidateChangesOnRedistribution.details) {
    console.log(
      `   ${detail.scenarioId}: antes [${detail.before.join(', ')}] → depois [${detail.after.join(', ')}]` +
        (detail.changed ? ' (mudou)' : ' (mesma candidata)'),
    );
  }
  console.log(
    `   ${report.candidateChangesOnRedistribution.scenariosWithChange} de ` +
      `${report.candidateChangesOnRedistribution.scenariosEvaluated} cenários avaliados mudaram de candidata — ` +
      'não generalizar para toda configuração possível.',
  );
  console.log('');
}

// ───────────────────────────────────────────────────────────────────────────
// Pares com/sem fadiga (§7.5) — reutiliza os MESMOS cenários e seeds do
// modelo sem fadiga (§6.3), reportado separadamente. Diferente do par de
// variabilidade (onde "sem" independe de seed), aqui as duas condições
// variam por seed — a fadiga interage com a flutuação já sorteada — então as
// 24 execuções "com fadiga" são novas, pareadas seed a seed com as 24
// "sem fadiga" que `evaluateStrategy` já tinha calculado.
// ───────────────────────────────────────────────────────────────────────────

interface FatiguePairReport {
  scenarioId: string;
  configLabel: 'inicial' | 'redistribuir';
  withFatigueTimedOutCount: number;
  /** Energia final de cada personagem, em cada seed concluída — uma distribuição, não só a mediana. */
  finalEnergySummary: Summary;
  /** Quantos (personagem, seed) chegaram a energia exatamente 0 — "frequência de energia zero" (§7.5). */
  energyZeroOccurrences: number;
  energyZeroSampleCount: number;
  /** Em quantas das seeds a fadiga produziu ao menos uma mudança sustentada de candidata (§7.4). */
  seedsWithSustainedCandidateChange: number;
  /** com fadiga − sem fadiga, pareado seed a seed. */
  timeDeltaSec: Summary;
  maxSpreadDeltaM: Summary;
}

function evaluateFatiguePair(
  scenarioId: string,
  strategyReport: StrategyReport,
  configLabel: FatiguePairReport['configLabel'],
): FatiguePairReport {
  const withFatigueRuns: RunRecord[] = [];
  const finalEnergies: number[] = [];
  let energyZeroOccurrences = 0;
  let seedsWithSustainedCandidateChange = 0;

  for (const seed of SEEDS) {
    const config: AttemptConfig = {
      ...strategyReport.referenceConfig,
      seed,
      fatigueMode: 'enabled',
      fatigueParams: DEFAULT_FATIGUE_PARAMS,
    };
    const state = runToEnd(config);
    const metrics = finalizeResult(config, state);

    withFatigueRuns.push({
      seed,
      outcome: metrics.outcome,
      totalTimeSec: metrics.totalTimeSec,
      maxSpreadM: metrics.maxSpreadM,
      meanSpreadM: metrics.meanSpreadM,
      collectiveProgressPct: metrics.collectiveProgressPct,
    });

    for (const characterId of config.order) {
      const energy = state.characters[characterId].energy;
      finalEnergies.push(energy);
      if (energy === 0) energyZeroOccurrences += 1;
    }

    const { events } = computeFatigueDiagnosisEvents(config);
    if (events.some((event) => event.kind === 'candidate_change')) {
      seedsWithSustainedCandidateChange += 1;
    }
  }

  const timeDeltas: number[] = [];
  const spreadDeltas: number[] = [];
  for (let i = 0; i < SEEDS.length; i += 1) {
    const withRun = withFatigueRuns[i];
    const withoutRun = strategyReport.runs[i];
    if (withRun.outcome === 'completed' && withoutRun.outcome === 'completed') {
      timeDeltas.push(withRun.totalTimeSec! - withoutRun.totalTimeSec!);
      spreadDeltas.push(withRun.maxSpreadM - withoutRun.maxSpreadM);
    }
  }

  const completedCount = withFatigueRuns.filter((run) => run.outcome === 'completed').length;

  return {
    scenarioId,
    configLabel,
    withFatigueTimedOutCount: withFatigueRuns.length - completedCount,
    finalEnergySummary: summarize(finalEnergies),
    energyZeroOccurrences,
    energyZeroSampleCount: finalEnergies.length,
    seedsWithSustainedCandidateChange,
    timeDeltaSec: summarize(timeDeltas),
    maxSpreadDeltaM: summarize(spreadDeltas),
  };
}

function printFatiguePair(pair: FatiguePairReport): void {
  console.log(`── ${pair.scenarioId} · ${pair.configLabel} · com − sem fadiga`);
  if (pair.withFatigueTimedOutCount > 0) {
    console.log(
      `   ATENÇÃO: ${pair.withFatigueTimedOutCount} de ${SEEDS.length} execuções com fadiga não concluíram.`,
    );
  }
  console.log(
    `   Energia final: mediana ${((pair.finalEnergySummary.median ?? 0) * 100).toFixed(1)}%` +
      `  faixa ${((pair.finalEnergySummary.min ?? 0) * 100).toFixed(1)}%–${((pair.finalEnergySummary.max ?? 0) * 100).toFixed(1)}%` +
      `  (${pair.energyZeroSampleCount} amostras personagem×seed)`,
  );
  console.log(
    `   Energia zero: ${pair.energyZeroOccurrences} de ${pair.energyZeroSampleCount} amostras chegaram ao piso.`,
  );
  console.log(
    `   Mudança sustentada de candidata: ${pair.seedsWithSustainedCandidateChange} de ${SEEDS.length} seeds mostraram ao menos uma.`,
  );
  console.log(
    `   Diferença observada (com − sem), ${pair.timeDeltaSec.count} pares concluídos dos dois lados:`,
  );
  console.log(
    `     tempo    mediana ${formatSeconds(pair.timeDeltaSec.median)}` +
      `  faixa ${formatSeconds(pair.timeDeltaSec.min)}–${formatSeconds(pair.timeDeltaSec.max)}`,
  );
  console.log(
    `     disp.máx mediana ${formatMeters(pair.maxSpreadDeltaM.median)}` +
      `  faixa ${formatMeters(pair.maxSpreadDeltaM.min)}–${formatMeters(pair.maxSpreadDeltaM.max)}`,
  );
  console.log('');
}

// ───────────────────────────────────────────────────────────────────────────
// Fixtures simples de fadiga (§7.5) — mesmas equações do motor (`step`),
// números reais reportados (a calibração avalia frequência e magnitude, não
// só mecanismo — isso já é validado bit a bit em testes determinísticos).
// ───────────────────────────────────────────────────────────────────────────

interface FatigueFixturesReport {
  freeVsLimitedEffort: { freeEnergyLoss: number; limitedEnergyLoss: number };
  higherRelativeLoad: { lightEnergyLoss: number; heavyEnergyLoss: number };
  zeroSaturation: { reachedZero: boolean; availableAtZeroKmh: number; referenceKmh: number };
  migrationOverTime: { found: boolean; seed: string | null; atSec: number | null };
}

function runFatigueFixtures(): FatigueFixturesReport {
  // 1) Esforço livre × limitado, mesma carga relativa dos dois lados (fixture do "caso 4").
  const effortScenario = buildScenario({
    id: 'lab-calib-esforco',
    revision: 1,
    distanceM: 100_000,
    timeLimitSec: 200_000,
    defaultSeed: 'lab-calib-esforco',
    characters: [
      { id: 'lento', displayName: 'Lento', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 },
      { id: 'rapido', displayName: 'Rápido', baseSpeedKmh: 7.2, referenceLoadKg: 10, variability: 0 },
    ],
    initialOrder: ['lento', 'rapido'],
    initialLoadKgByCharacter: { lento: 10, rapido: 10 },
  });
  const effortConfig = createAttemptConfig(effortScenario, {
    fatigueMode: 'enabled',
    fatigueParams: DEFAULT_FATIGUE_PARAMS,
  });
  const effortState = step(effortConfig, createInitialState(effortConfig));
  const freeVsLimitedEffort = {
    freeEnergyLoss: 1 - effortState.characters.lento.energy,
    limitedEnergyLoss: 1 - effortState.characters.rapido.energy,
  };

  // 2) Carga relativa maior, mesmo esforço relativo (dois personagens livres, sozinhos).
  const lightScenario = buildScenario({
    id: 'lab-calib-leve',
    revision: 1,
    distanceM: 100_000,
    timeLimitSec: 200_000,
    defaultSeed: 'lab-calib-leve',
    characters: [{ id: 'x', displayName: 'X', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 }],
    initialOrder: ['x'],
    initialLoadKgByCharacter: { x: 5 },
  });
  const heavyScenario = buildScenario({
    id: 'lab-calib-pesado',
    revision: 1,
    distanceM: 100_000,
    timeLimitSec: 200_000,
    defaultSeed: 'lab-calib-pesado',
    characters: [{ id: 'x', displayName: 'X', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 }],
    initialOrder: ['x'],
    initialLoadKgByCharacter: { x: 20 },
  });
  const lightConfig = createAttemptConfig(lightScenario, {
    fatigueMode: 'enabled',
    fatigueParams: DEFAULT_FATIGUE_PARAMS,
  });
  const heavyConfig = createAttemptConfig(heavyScenario, {
    fatigueMode: 'enabled',
    fatigueParams: DEFAULT_FATIGUE_PARAMS,
  });
  const lightState = step(lightConfig, createInitialState(lightConfig));
  const heavyState = step(heavyConfig, createInitialState(heavyConfig));
  const higherRelativeLoad = {
    lightEnergyLoss: 1 - lightState.characters.x.energy,
    heavyEnergyLoss: 1 - heavyState.characters.x.energy,
  };

  // 3) Saturação em zero: drenagem agressiva, só para o teste não levar horas simuladas.
  const zeroScenario = buildScenario({
    id: 'lab-calib-zero',
    revision: 1,
    distanceM: 1_000_000,
    timeLimitSec: 200_000,
    defaultSeed: 'lab-calib-zero',
    characters: [{ id: 'solo', displayName: 'Solo', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 }],
    initialOrder: ['solo'],
    initialLoadKgByCharacter: { solo: 0 },
  });
  const zeroConfig = createAttemptConfig(zeroScenario, {
    fatigueMode: 'enabled',
    fatigueParams: { version: 'calib-aggressive', drainPerSec: 0.5, loadDrainCoefficient: 0, minFatigueFactor: 0.6 },
  });
  let zeroState = createInitialState(zeroConfig);
  for (let tick = 0; tick < 10; tick += 1) zeroState = step(zeroConfig, zeroState);
  const zeroSaturation = {
    reachedZero: zeroState.characters.solo.energy === 0,
    availableAtZeroKmh: zeroState.characters.solo.availableSpeedMps * 3.6,
    referenceKmh: 3.6, // baseSpeedKmh acima, sem carga: referenceSpeed = baseSpeedKmh
  };

  // 4) Migração ao longo do tempo: mesma fixture usada nos testes determinísticos.
  const migrationScenario = buildScenario({
    id: 'lab-calib-migracao',
    revision: 1,
    distanceM: 1_000_000,
    timeLimitSec: 100_000,
    defaultSeed: 'lab-calib-migracao',
    characters: [
      { id: 'pesado', displayName: 'Pesado', baseSpeedKmh: 6.0, referenceLoadKg: 10, variability: 0 },
      { id: 'leve', displayName: 'Leve', baseSpeedKmh: 4.0, referenceLoadKg: 10, variability: 0 },
    ],
    initialOrder: ['pesado', 'leve'],
    initialLoadKgByCharacter: { pesado: 30, leve: 10 },
  });
  const migrationConfig = createAttemptConfig(migrationScenario, {
    fatigueMode: 'enabled',
    fatigueParams: { version: 'calib-aggressive', drainPerSec: 0.002, loadDrainCoefficient: 0.5, minFatigueFactor: 0.6 },
  });
  const { events } = computeFatigueDiagnosisEvents(migrationConfig);
  const firstChange = events.find((event) => event.kind === 'candidate_change');

  return {
    freeVsLimitedEffort,
    higherRelativeLoad,
    zeroSaturation,
    migrationOverTime: {
      found: firstChange !== undefined,
      seed: firstChange ? migrationConfig.seed : null,
      atSec: firstChange?.atSec ?? null,
    },
  };
}

function printFatigueFixtures(report: FatigueFixturesReport): void {
  console.log('── 1) Esforço livre × limitado (mesma carga relativa)');
  console.log(
    `   Livre perdeu ${(report.freeVsLimitedEffort.freeEnergyLoss * 100).toFixed(4)}% de energia no tick; ` +
      `limitado perdeu ${(report.freeVsLimitedEffort.limitedEnergyLoss * 100).toFixed(4)}% — ` +
      `${report.freeVsLimitedEffort.limitedEnergyLoss < report.freeVsLimitedEffort.freeEnergyLoss ? 'menos, como esperado' : 'ATENÇÃO: não foi menor'}.`,
  );
  console.log('');

  console.log('── 2) Carga relativa maior, mesmo esforço relativo');
  console.log(
    `   Carga leve perdeu ${(report.higherRelativeLoad.lightEnergyLoss * 100).toFixed(4)}%; ` +
      `carga pesada perdeu ${(report.higherRelativeLoad.heavyEnergyLoss * 100).toFixed(4)}% — ` +
      `${report.higherRelativeLoad.heavyEnergyLoss > report.higherRelativeLoad.lightEnergyLoss ? 'mais, como esperado' : 'ATENÇÃO: não foi maior'}.`,
  );
  console.log('');

  console.log('── 3) Saturação em zero');
  console.log(
    `   Energia chegou a zero: ${report.zeroSaturation.reachedZero ? 'sim' : 'não'}. ` +
      `Velocidade disponível no piso: ${report.zeroSaturation.availableAtZeroKmh.toFixed(2)} km/h ` +
      `(referência ${report.zeroSaturation.referenceKmh.toFixed(2)} km/h × minFatigueFactor 0,6 = ` +
      `${(report.zeroSaturation.referenceKmh * 0.6).toFixed(2)} km/h esperado).`,
  );
  console.log('');

  console.log('── 4) Migração de candidata ao longo do tempo (fixture, não roteiro em partidas reais)');
  if (report.migrationOverTime.found) {
    console.log(
      `   Encontrada com a seed "${report.migrationOverTime.seed}", em ${formatSeconds(report.migrationOverTime.atSec)}.`,
    );
  } else {
    console.log('   ATENÇÃO: a fixture de migração não mostrou mudança sustentada — revisar parâmetros.');
  }
  console.log('');
}

async function main(): Promise<void> {
  console.log('Calibração do Simulador da Trilha');
  console.log(`Motor ${ENGINE_VERSION} · RNG ${RANDOM_VERSION}`);
  console.log(`Seeds de simulação fixas: ${SEEDS[0]} … ${SEEDS[SEEDS.length - 1]} (${SEEDS.length})`);
  console.log(
    `Expedições geradas avaliadas: ${GENERATED_EXPEDITIONS_PER_SIZE} por tamanho, tamanhos ` +
      `${GENERATED_PARTY_SIZES.join(', ')}`,
  );

  const fixedReports = [SCENARIO_A, SCENARIO_B].map(evaluateScenario);
  const generatedEntries = await evaluateGeneratedScenarios();
  const allScenarioReports = [...fixedReports, ...generatedEntries.map((entry) => entry.report)];

  for (const report of allScenarioReports) {
    printScenario(report);
  }

  // Pares com/sem variabilidade: cenários fixos + uma expedição gerada por
  // tamanho (a primeira de cada — as outras duas por tamanho já bastam para a
  // amostragem de configurações distintas do §6.3, sem triplicar esta seção).
  const pairReports: ScenarioReport[] = [
    fixedReports[0],
    fixedReports[1],
    ...GENERATED_PARTY_SIZES.map((_size, i) => generatedEntries[i * GENERATED_EXPEDITIONS_PER_SIZE].report),
  ];

  console.log('═══ Pares com/sem variabilidade (§6.3) ═══');
  console.log('');
  const variabilityPairs: VariabilityPairReport[] = [];
  for (const report of pairReports) {
    const inicial = report.strategies.find((s) => s.strategyId === 'inicial')!;
    const redistribuida = report.strategies.find((s) => s.strategyId === 'carga')!;

    const pairInicial = evaluateVariabilityPair(report.scenarioId, inicial, 'inicial');
    const pairRedistribuida = evaluateVariabilityPair(report.scenarioId, redistribuida, 'redistribuir');
    variabilityPairs.push(pairInicial, pairRedistribuida);
    printVariabilityPair(pairInicial);
    printVariabilityPair(pairRedistribuida);
  }

  const pedagogicalChecks = runPedagogicalChecks();
  printPedagogicalChecks(pedagogicalChecks);

  // ─── Frente 5: energia e fadiga — relatada separadamente do modelo sem
  // fadiga (§7.5), reutilizando os mesmos cenários e seeds dos pares acima.
  console.log('═══ Fadiga — pares com/sem fadiga (§7.5, evolução pedagógica frente 5) ═══');
  console.log('');
  const fatiguePairs: FatiguePairReport[] = [];
  for (const report of pairReports) {
    const inicial = report.strategies.find((s) => s.strategyId === 'inicial')!;
    const redistribuida = report.strategies.find((s) => s.strategyId === 'carga')!;

    const pairInicial = evaluateFatiguePair(report.scenarioId, inicial, 'inicial');
    const pairRedistribuida = evaluateFatiguePair(report.scenarioId, redistribuida, 'redistribuir');
    fatiguePairs.push(pairInicial, pairRedistribuida);
    printFatiguePair(pairInicial);
    printFatiguePair(pairRedistribuida);
  }

  const fatigueFixtures = runFatigueFixtures();
  console.log('═══ Fixtures de fadiga (§7.5) ═══');
  console.log('');
  printFatigueFixtures(fatigueFixtures);

  // Contagem honesta: cada execução (uma seed × uma estratégia × um cenário)
  // é uma amostra pareada da MESMA configuração de personagens, não um
  // cenário independente — não repetir a linguagem "N cenários independentes".
  const distinctScenarioConfigs = allScenarioReports.length;
  const totalSimulationRuns =
    allScenarioReports.reduce((sum, report) => sum + report.strategies.reduce((s, st) => s + st.runs.length, 0), 0) +
    variabilityPairs.length + // +1 execução sem variabilidade por par
    fatiguePairs.length * SEEDS.length + // 24 execuções "com fadiga" por par
    4; // fixtures de fadiga (cada uma, 1 ou 2 execuções curtas)
  console.log('═══ Amostragem desta calibração ═══');
  console.log(
    `${distinctScenarioConfigs} configurações distintas (2 cenários fixos + ` +
      `${generatedEntries.length} expedições geradas) · ${SEEDS.length} seeds de simulação por estratégia · ` +
      `${totalSimulationRuns} execuções do motor ao todo (estratégias, pares sem variabilidade, pares com fadiga e fixtures).`,
  );
  console.log('');

  const payload = {
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    randomVersion: RANDOM_VERSION,
    seeds: SEEDS,
    sampling: {
      distinctScenarioConfigs,
      seedsPerStrategy: SEEDS.length,
      totalSimulationRuns,
      generatedExpeditionsPerSize: GENERATED_EXPEDITIONS_PER_SIZE,
      generatedPartySizes: GENERATED_PARTY_SIZES,
    },
    scenarios: allScenarioReports.map((report) => ({
      ...report,
      // `referenceConfig` (o AttemptConfig completo, só usado para reaproveitar
      // execuções nos pares com/sem variabilidade) fica fora do JSON — repetiria
      // o cenário inteiro por estratégia sem acrescentar nada ao relatório.
      strategies: report.strategies.map((strategy) => ({
        strategyId: strategy.strategyId,
        label: strategy.label,
        description: strategy.description,
        order: strategy.order,
        loadKgByCharacter: strategy.loadKgByCharacter,
        runs: strategy.runs,
        completedCount: strategy.completedCount,
        timedOutCount: strategy.timedOutCount,
        totalTime: strategy.totalTime,
        maxSpread: strategy.maxSpread,
        meanSpread: strategy.meanSpread,
      })),
    })),
    generatedExpeditions: generatedEntries.map((entry) => ({
      scenarioId: entry.report.scenarioId,
      generationSeed: entry.generationSeed,
      usedReserve: entry.usedReserve,
    })),
    variabilityPairs,
    pedagogicalChecks,
    fatiguePairs,
    fatigueFixtures,
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
