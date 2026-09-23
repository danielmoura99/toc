/**
 * Experimento "com e sem variabilidade" — evolução pedagógica, frente 2.
 *
 * A condição "com variabilidade" é a própria tentativa de origem, reutilizada
 * sem duplicar (§4.1: "reutilizá-lo na comparação; não duplicá-lo
 * desnecessariamente") — este módulo só constrói a condição nova ("sem
 * variabilidade") e valida o par depois de ambas existirem.
 */

import { computeLoadByCharacter } from '../domain/engine';
import { sameCast, sameItems } from '../domain/metrics';
import type { AttemptConfig, AttemptResult, Scenario } from '../domain/types';

export interface ExperimentValidation {
  ok: boolean;
  issues: string[];
}

/** Verdadeiro se algum personagem tem variabilidade > 0 — sem isso, "sem variabilidade" produziria o mesmo resultado. */
export function hasVariabilityToObserve(scenario: Scenario): boolean {
  return scenario.characters.some((character) => character.variability > 0);
}

/**
 * A tentativa de origem precisa estar concluída, no modo padrão e não ser,
 * ela mesma, uma derivada experimental — o experimento nasce de uma
 * caminhada real, não de outro experimento.
 */
export function canStartVariabilityExperiment(origin: AttemptResult): ExperimentValidation {
  const issues: string[] = [];

  if (origin.config.variabilityMode !== 'standard') {
    issues.push('Esta tentativa já está numa condição experimental de variabilidade.');
  }
  if (origin.config.experimentOf) {
    issues.push('Esta tentativa já é derivada de outro experimento.');
  }
  if (!hasVariabilityToObserve(origin.config.scenario)) {
    issues.push('Todos os personagens têm variabilidade zero nesta expedição — as duas condições seriam iguais.');
  }
  // O experimento de variabilidade continua exigindo fadiga desligada nos
  // dois lados (§7.3) — isola só o mecanismo da variabilidade.
  if (origin.config.fatigueMode === 'enabled') {
    issues.push('O experimento de variabilidade exige fadiga desligada — esta tentativa tem fadiga ativa.');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Constrói a condição "sem variabilidade": mesmo snapshot da origem, só o
 * fator de flutuação muda — nunca `character.variability` no cenário, nunca
 * a seed, ordem, cargas ou qualquer outro parâmetro (§4.1, §4.2).
 */
export function buildWithoutVariabilityConfig(origin: AttemptResult): AttemptConfig {
  return {
    ...origin.config,
    variabilityMode: 'disabled',
    experimentOf: { originAttemptId: origin.id, kind: 'variability' },
  };
}

/**
 * Valida um par experimental completo: os mesmos dados físicos dos dois
 * lados, exceto a condição de variabilidade — nomes e velocidade de
 * reprodução não entram na checagem, porque não influenciam o resultado
 * (§4.3: "Verificar os dados, não apenas o identificador do par").
 */
export function validateVariabilityPair(
  withVariability: AttemptResult,
  withoutVariability: AttemptResult,
): ExperimentValidation {
  const issues: string[] = [];
  const a = withVariability.config;
  const b = withoutVariability.config;

  if (a.variabilityMode !== 'standard') {
    issues.push('A condição "com variabilidade" precisa estar no modo padrão.');
  }
  if (b.variabilityMode !== 'disabled') {
    issues.push('A condição "sem variabilidade" precisa ter a variabilidade desligada.');
  }
  if (b.experimentOf?.kind !== 'variability' || b.experimentOf.originAttemptId !== withVariability.id) {
    issues.push('A condição "sem variabilidade" não está vinculada a esta tentativa de origem.');
  }
  if (a.fatigueMode === 'enabled' || b.fatigueMode === 'enabled') {
    issues.push('O experimento de variabilidade exige fadiga desligada nos dois lados.');
  }

  if (a.engineVersion !== b.engineVersion) issues.push('Versão do motor diferente entre as condições.');
  if (a.scenario.id !== b.scenario.id || a.scenario.revision !== b.scenario.revision) {
    issues.push('Cenário diferente entre as condições.');
  }
  if (a.seed !== b.seed) issues.push('Seed diferente entre as condições.');
  if (a.scenario.distanceM !== b.scenario.distanceM) issues.push('Distância diferente entre as condições.');
  if (a.tickSec !== b.tickSec) issues.push('Passo de simulação diferente entre as condições.');
  if (a.scenario.variabilityBlockSec !== b.scenario.variabilityBlockSec) {
    issues.push('Bloco de variabilidade diferente entre as condições.');
  }
  if (!sameCast(a, b)) issues.push('Elenco ou atributos diferentes entre as condições.');
  if (!sameItems(a, b)) issues.push('Itens diferentes entre as condições.');
  if (a.order.join(',') !== b.order.join(',')) {
    issues.push('Ordem diferente entre as condições — o experimento isola só a variabilidade.');
  }

  const loadA = computeLoadByCharacter(a);
  const loadB = computeLoadByCharacter(b);
  const sameLoad = Object.keys(loadA).every((id) => loadA[id] === loadB[id]);
  if (!sameLoad) {
    issues.push('Distribuição de carga diferente entre as condições — o experimento isola só a variabilidade.');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Diferença "com − sem", rotulada "Diferença observada" (§4.3). `null`
 * quando qualquer um dos lados não tem o dado (timeout não inventa tempo).
 */
export function signedDifference(withValue: number | null, withoutValue: number | null): number | null {
  if (withValue === null || withoutValue === null) return null;
  return withValue - withoutValue;
}

/**
 * Limiar de apresentação: diferenças de tempo total abaixo de 2% do tempo da
 * condição "com variabilidade" são anunciadas como pequenas — decisão de
 * como descrever o resultado, não uma lei da física do motor (mesmo espírito
 * de `CAPACITY_CANDIDATE_TOLERANCE`, registrada em `docs/decisions.md`).
 */
export const SMALL_DIFFERENCE_RATIO = 0.02;

export function isSmallTimeDifference(deltaSec: number | null, withValueSec: number | null): boolean {
  if (deltaSec === null || withValueSec === null || withValueSec === 0) return false;
  return Math.abs(deltaSec) / withValueSec < SMALL_DIFFERENCE_RATIO;
}
