/**
 * Gerador de expedições — cenários sorteados dentro de faixas calibradas.
 *
 * Constrói sobre o motor existente, sem alterar suas fórmulas: usa
 * `deterministicRandom` (o mesmo PRNG que já decide a variação de ritmo
 * durante a caminhada) para sortear atributos, ordem e mochilas, e
 * `buildScenario` (a mesma função que monta os cenários A e B) para virar
 * isso num `Scenario` de verdade — com `maxLoadKg` sempre derivado e os itens
 * sempre conservados, porque é `buildScenario` quem garante isso, não este
 * módulo.
 *
 * As faixas numéricas abaixo replicam a mesma estrutura calibrada dos
 * cenários A e B (ver `docs/decisions.md`, resultados da calibração original):
 * a maioria do grupo com folga confortável, e uma pessoa "gargalo" — carga de
 * referência baixa, carregada exatamente no teto (3× a referência) — para que
 * exista uma restrição real a discutir, não uma distribuição plana sem efeito.
 */

import type { CharacterId, GuidedStage, Scenario } from '../domain/types';
import { deterministicRandom } from '../domain/random';
import { createAttemptConfig } from '../domain/attempt';
import { runToEnd } from '../domain/engine';
import { finalizeResult } from '../domain/metrics';
import { buildScenario, type CharacterSpec, type ScenarioSpec } from './builder';
import { overloadFastest, redistributeFromBottleneck } from './strategies';

export const MIN_PARTY_SIZE = 4;
export const MAX_PARTY_SIZE = 12;

const DISTANCE_M = 3000;
const TIME_LIMIT_SEC = 14400;
const VARIABILITY = 0.2;

const SPEED_RANGE_KMH: [number, number] = [4.4, 5.2];
const NORMAL_REFERENCE_LOAD_RANGE_KG: [number, number] = [10, 15];
const BOTTLENECK_REFERENCE_LOAD_RANGE_KG: [number, number] = [5, 8];
/** Carga total do grupo, em kg por pessoa — mesma média do cenário A (48 kg / 6). */
const AVERAGE_LOAD_PER_PERSON_KG = 8;
const BOTTLENECK_LOAD_FACTOR = 3; // sempre no teto — mesma regra de MAX_LOAD_FACTOR do domínio.

/** Tentativas de geração antes de recorrer à configuração de reserva. */
export const MAX_GENERATION_ATTEMPTS = 30;

/** Limiares que definem "adequada ao treinamento" (§6.3 do guia, generalizado para N). */
const MIN_SPACE_FORMATION_M = DISTANCE_M * 0.1;
const MIN_LIMITED_TIME_SEC = 60;
const MIN_REDISTRIBUTION_IMPROVEMENT_PCT = 10;

function lerp(min: number, max: number, u: number): number {
  return min + (max - min) * u;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function characterId(index: number): CharacterId {
  return `c${index + 1}`;
}

function characterDisplayName(index: number): string {
  return `Caminhante ${index + 1}`;
}

/**
 * Monta a especificação de uma expedição candidata, inteiramente a partir da
 * seed — a mesma seed reconstrói exatamente a mesma especificação sempre,
 * sem depender de `Math.random` nem de qualquer estado externo.
 */
export function buildCandidateSpec(seed: string, partySize: number): ScenarioSpec {
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE || partySize > MAX_PARTY_SIZE) {
    throw new Error(`Tamanho de grupo inválido: ${partySize} (esperado entre ${MIN_PARTY_SIZE} e ${MAX_PARTY_SIZE}).`);
  }

  const bottleneckIndex = Math.floor(deterministicRandom(seed, 'bottleneck-index', 0) * partySize);

  const characters: CharacterSpec[] = [];
  for (let i = 0; i < partySize; i += 1) {
    const isBottleneck = i === bottleneckIndex;
    const speedU = deterministicRandom(seed, 'base-speed', i);
    const refU = deterministicRandom(seed, isBottleneck ? 'reference-load-bottleneck' : 'reference-load', i);

    characters.push({
      id: characterId(i),
      displayName: characterDisplayName(i),
      baseSpeedKmh: roundTo(lerp(SPEED_RANGE_KMH[0], SPEED_RANGE_KMH[1], speedU), 1),
      referenceLoadKg: Math.round(
        lerp(
          isBottleneck ? BOTTLENECK_REFERENCE_LOAD_RANGE_KG[0] : NORMAL_REFERENCE_LOAD_RANGE_KG[0],
          isBottleneck ? BOTTLENECK_REFERENCE_LOAD_RANGE_KG[1] : NORMAL_REFERENCE_LOAD_RANGE_KG[1],
          refU,
        ),
      ),
      variability: VARIABILITY,
    });
  }

  const bottleneckId = characterId(bottleneckIndex);
  const bottleneckLoadKg = BOTTLENECK_LOAD_FACTOR * characters[bottleneckIndex].referenceLoadKg;

  // O resto do peso total se reparte o mais igualmente possível entre quem
  // não é o gargalo — mesmo padrão dos cenários A e B, onde todo mundo além
  // da restrição carrega a mesma quantidade modesta.
  const totalWeightKg = AVERAGE_LOAD_PER_PERSON_KG * partySize;
  const remainingKg = Math.max(0, totalWeightKg - bottleneckLoadKg);
  const othersCount = partySize - 1;
  const baseShare = Math.floor(remainingKg / othersCount);
  const remainder = Math.round(remainingKg - baseShare * othersCount);

  const initialLoadKgByCharacter: Record<CharacterId, number> = { [bottleneckId]: bottleneckLoadKg };
  let othersSeen = 0;
  for (let i = 0; i < partySize; i += 1) {
    if (i === bottleneckIndex) continue;
    initialLoadKgByCharacter[characterId(i)] = baseShare + (othersSeen < remainder ? 1 : 0);
    othersSeen += 1;
  }

  // Embaralhamento de Fisher-Yates, usando a mesma seed — a ordem sorteada é
  // reproduzível como qualquer outro sorteio do motor.
  const order = characters.map((character) => character.id);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(deterministicRandom(seed, 'order-shuffle', i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return {
    id: `expedicao-${seed}`,
    revision: 1,
    distanceM: DISTANCE_M,
    timeLimitSec: TIME_LIMIT_SEC,
    defaultSeed: seed,
    characters,
    initialOrder: order,
    initialLoadKgByCharacter,
  };
}

/**
 * Configuração de reserva, determinística — sem sorteio. Reproduz a mesma
 * estrutura calibrada dos cenários A e B (referência 6 kg × limite 18 kg para
 * o gargalo, referência 12 kg × carga 6 kg para o resto), só que parametrizada
 * pelo tamanho do grupo. Existe para nunca deixar a geração sem resultado: se
 * as `MAX_GENERATION_ATTEMPTS` tentativas aleatórias não produzirem uma
 * configuração adequada, esta é o que a expedição usa.
 */
export function buildReserveSpec(partySize: number): ScenarioSpec {
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE || partySize > MAX_PARTY_SIZE) {
    throw new Error(`Tamanho de grupo inválido: ${partySize} (esperado entre ${MIN_PARTY_SIZE} e ${MAX_PARTY_SIZE}).`);
  }

  // No meio da fila: nem na ponta livre, nem tão atrás que ninguém além dele
  // sinta a restrição.
  const bottleneckIndex = Math.floor(partySize / 2);

  const characters: CharacterSpec[] = Array.from({ length: partySize }, (_, i) => ({
    id: characterId(i),
    displayName: characterDisplayName(i),
    // Padrão fixo, não sorteado: os mesmos cinco incrementos do cenário A,
    // repetidos ciclicamente.
    baseSpeedKmh: roundTo(4.5 + (i % 5) * 0.15, 2),
    referenceLoadKg: i === bottleneckIndex ? 6 : 12,
    variability: VARIABILITY,
  }));

  const initialLoadKgByCharacter: Record<CharacterId, number> = {};
  for (let i = 0; i < partySize; i += 1) {
    initialLoadKgByCharacter[characterId(i)] = i === bottleneckIndex ? 18 : 6;
  }

  return {
    id: `expedicao-reserva-${partySize}`,
    revision: 1,
    distanceM: DISTANCE_M,
    timeLimitSec: TIME_LIMIT_SEC,
    defaultSeed: `expedicao-reserva-${partySize}`,
    characters,
    initialOrder: characters.map((character) => character.id),
    initialLoadKgByCharacter,
  };
}

export interface ScenarioCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * As quatro propriedades que o guia (§6.3) pede da calibração, verificadas
 * sobre o cenário candidato — reaproveitando as mesmas estratégias do script
 * de calibração, não uma reimplementação paralela.
 */
export function evaluateGeneratedScenario(scenario: Scenario): ScenarioCheckResult {
  const baseline = createAttemptConfig(scenario);
  const baselineState = runToEnd(baseline);

  if (baselineState.status !== 'completed') {
    return { ok: false, reason: 'a configuração inicial não conclui dentro do limite de tempo' };
  }

  const baselineMetrics = finalizeResult(baseline, baselineState);

  // 1) Formação perceptível de espaços.
  if (baselineMetrics.maxSpreadM < MIN_SPACE_FORMATION_M) {
    return { ok: false, reason: `dispersão máxima baixa demais (${baselineMetrics.maxSpreadM.toFixed(0)} m)` };
  }

  // 2) Alguém, além de quem vai na frente, fica limitado pela fila (R04: o
  // primeiro nunca é limitado, então não faz parte desta checagem).
  const someoneLimited = baseline.order
    .slice(1)
    .some((id) => baselineState.characters[id].limitedTimeSec >= MIN_LIMITED_TIME_SEC);
  if (!someoneLimited) {
    return { ok: false, reason: 'ninguém fica limitado pela fila por tempo suficiente' };
  }

  // 3) Redistribuir a carga melhora o resultado coletivo.
  const balanced = redistributeFromBottleneck(baseline);
  const balancedState = runToEnd(balanced);
  if (balancedState.status !== 'completed') {
    return { ok: false, reason: 'a redistribuição equilibrada não conclui dentro do limite de tempo' };
  }
  const balancedMetrics = finalizeResult(balanced, balancedState);

  const improvementPct =
    ((baselineMetrics.totalTimeSec! - balancedMetrics.totalTimeSec!) / baselineMetrics.totalTimeSec!) * 100;
  if (improvementPct < MIN_REDISTRIBUTION_IMPROVEMENT_PCT) {
    return { ok: false, reason: `redistribuir melhora pouco o tempo (${improvementPct.toFixed(1)}%)` };
  }

  // 4) Redistribuir demais é demonstrável: pior que o equilíbrio — exatamente
  // o efeito descrito em D09. Não exige mais que o excesso também fique
  // melhor que a situação inicial (evolução pedagógica, §6.1): comparado
  // apenas ao "não fazer nada", excesso pode continuar melhor, empatar ou
  // ficar pior — a piora relevante é frente ao equilíbrio, não frente à
  // configuração inicial.
  const excess = overloadFastest(baseline);
  const excessState = runToEnd(excess);
  if (excessState.status !== 'completed') {
    return { ok: false, reason: 'a redistribuição excessiva não conclui dentro do limite de tempo' };
  }
  const excessMetrics = finalizeResult(excess, excessState);

  if (excessMetrics.totalTimeSec! <= balancedMetrics.totalTimeSec!) {
    return { ok: false, reason: 'redistribuir demais não fica pior que redistribuir com equilíbrio' };
  }

  return { ok: true };
}

export interface GeneratedExpedition {
  scenario: Scenario;
  /** Verdadeiro quando as tentativas aleatórias se esgotaram e a reserva foi usada. */
  usedReserve: boolean;
  /** Quantas tentativas (incluindo a aceita, ou todas as `MAX_GENERATION_ATTEMPTS` se caiu na reserva). */
  attempts: number;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function randomSeed(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `expedicao-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Gera uma expedição sorteada. Tenta até `MAX_GENERATION_ATTEMPTS`
 * configurações candidatas, verificando cada uma com
 * `evaluateGeneratedScenario`; a primeira que passar é usada. Se nenhuma
 * passar, usa a configuração de reserva do tamanho de grupo pedido — a
 * geração nunca falha, apenas pode não sortear nada.
 *
 * Assíncrona e cede o controle entre tentativas (`yieldToMainThread`) para
 * não travar a interface: cada candidata roda até três simulações completas
 * (a inicial e duas estratégias), e o laço inteiro não deve prender a aba.
 *
 * `seedOverride` existe para testes e para o script de calibração
 * reproduzirem a mesma expedição em execuções diferentes; a aplicação não
 * expõe isso ao operador.
 */
export async function generateExpedition(
  partySize: number,
  seedOverride?: string,
): Promise<GeneratedExpedition> {
  const baseSeed = seedOverride ?? randomSeed();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidateSeed = `${baseSeed}:${attempt}`;
    const spec = buildCandidateSpec(candidateSeed, partySize);
    const scenario = buildScenario(spec);

    if (evaluateGeneratedScenario(scenario).ok) {
      return { scenario, usedReserve: false, attempts: attempt + 1 };
    }

    if (attempt < MAX_GENERATION_ATTEMPTS - 1) {
      await yieldToMainThread();
    }
  }

  return {
    scenario: buildScenario(buildReserveSpec(partySize)),
    usedReserve: true,
    attempts: MAX_GENERATION_ATTEMPTS,
  };
}

/** Etapa inicial de toda expedição gerada: observar, sem alterar nada (ver `application/stages.ts`). */
export const EXPEDITION_INITIAL_STAGE: GuidedStage = 1;
