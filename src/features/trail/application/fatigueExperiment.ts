/**
 * Experimento "com e sem fadiga" — evolução pedagógica, frente 5 (§7.3).
 *
 * Mesmo padrão do experimento de variabilidade (§4.1): a condição "sem
 * fadiga" é a própria tentativa de origem, reutilizada sem duplicar; este
 * módulo só constrói a condição nova ("com fadiga") e valida o par depois.
 */

import { ENGINE_VERSION } from '../domain/types';
import { computeLoadByCharacter } from '../domain/engine';
import { DEFAULT_FATIGUE_PARAMS } from '../domain/fatigue';
import { sameCast, sameItems } from '../domain/metrics';
import type { AttemptConfig, AttemptResult } from '../domain/types';

export interface ExperimentValidation {
  ok: boolean;
  issues: string[];
}

/**
 * A tentativa de origem precisa estar concluída, sem fadiga, sem ser ela
 * mesma uma derivada experimental, e da versão atual do motor — "reutilizar
 * o resultado sem fadiga apenas se tiver semântica física e versão
 * compatíveis" (§7.3). Uma origem de outra versão simplesmente não pode
 * iniciar o experimento nesta entrega, em vez de silenciosamente comparar
 * semânticas diferentes.
 */
export function canStartFatigueExperiment(origin: AttemptResult): ExperimentValidation {
  const issues: string[] = [];

  if (origin.config.fatigueMode !== 'disabled') {
    issues.push('Esta tentativa já está numa condição experimental de fadiga.');
  }
  if (origin.config.experimentOf) {
    issues.push('Esta tentativa já é derivada de outro experimento.');
  }
  if (origin.config.engineVersion !== ENGINE_VERSION) {
    issues.push('Esta tentativa foi gravada com outra versão do motor — reexecute-a antes de experimentar.');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Constrói a condição "com fadiga": mesmo snapshot da origem — seed, ordem,
 * carga, atributos, condição de variabilidade — só `fatigueMode` muda de
 * `disabled` para `enabled` (§7.3). Sempre com os parâmetros padrão do
 * modelo; não há edição de coeficientes na UI.
 */
export function buildWithFatigueConfig(origin: AttemptResult): AttemptConfig {
  return {
    ...origin.config,
    fatigueMode: 'enabled',
    fatigueParams: DEFAULT_FATIGUE_PARAMS,
    experimentOf: { originAttemptId: origin.id, kind: 'fatigue' },
  };
}

/**
 * Valida um par experimental completo: os mesmos dados físicos dos dois
 * lados, exceto a condição de fadiga.
 */
export function validateFatiguePair(withoutFatigue: AttemptResult, withFatigue: AttemptResult): ExperimentValidation {
  const issues: string[] = [];
  const a = withoutFatigue.config;
  const b = withFatigue.config;

  if (a.fatigueMode !== 'disabled') {
    issues.push('A condição "sem fadiga" precisa ter a fadiga desligada.');
  }
  if (b.fatigueMode !== 'enabled') {
    issues.push('A condição "com fadiga" precisa ter a fadiga ativa.');
  }
  if (b.experimentOf?.kind !== 'fatigue' || b.experimentOf.originAttemptId !== withoutFatigue.id) {
    issues.push('A condição "com fadiga" não está vinculada a esta tentativa de origem.');
  }
  if (
    b.fatigueParams.version !== DEFAULT_FATIGUE_PARAMS.version ||
    b.fatigueParams.drainPerSec !== DEFAULT_FATIGUE_PARAMS.drainPerSec ||
    b.fatigueParams.loadDrainCoefficient !== DEFAULT_FATIGUE_PARAMS.loadDrainCoefficient ||
    b.fatigueParams.minFatigueFactor !== DEFAULT_FATIGUE_PARAMS.minFatigueFactor
  ) {
    issues.push('Os parâmetros de fadiga não são os padrão do modelo atual.');
  }

  if (a.engineVersion !== b.engineVersion) issues.push('Versão do motor diferente entre as condições.');
  if (a.scenario.id !== b.scenario.id || a.scenario.revision !== b.scenario.revision) {
    issues.push('Cenário diferente entre as condições.');
  }
  if (a.seed !== b.seed) issues.push('Seed diferente entre as condições.');
  if (a.variabilityMode !== b.variabilityMode) {
    issues.push('Condição de variabilidade diferente entre as condições.');
  }
  if (a.scenario.distanceM !== b.scenario.distanceM) issues.push('Distância diferente entre as condições.');
  if (a.tickSec !== b.tickSec) issues.push('Passo de simulação diferente entre as condições.');
  if (a.scenario.variabilityBlockSec !== b.scenario.variabilityBlockSec) {
    issues.push('Bloco de variabilidade diferente entre as condições.');
  }
  if (!sameCast(a, b)) issues.push('Elenco ou atributos diferentes entre as condições.');
  if (!sameItems(a, b)) issues.push('Itens diferentes entre as condições.');
  if (a.order.join(',') !== b.order.join(',')) {
    issues.push('Ordem diferente entre as condições — o experimento isola só a fadiga.');
  }

  const loadA = computeLoadByCharacter(a);
  const loadB = computeLoadByCharacter(b);
  const sameLoad = Object.keys(loadA).every((id) => loadA[id] === loadB[id]);
  if (!sameLoad) {
    issues.push('Distribuição de carga diferente entre as condições — o experimento isola só a fadiga.');
  }

  return { ok: issues.length === 0, issues };
}
