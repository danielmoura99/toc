/**
 * Feedback automático da comparação (§8.3).
 *
 * Frases geradas por template a partir de números já calculados pelo domínio
 * — nunca um valor inventado, nunca uma causalidade atribuída quando várias
 * variáveis mudaram ao mesmo tempo, nunca "solução ótima".
 */

import type { ComparabilityIssue } from '../domain/metrics';
import type { ComparisonResult } from '../domain/metrics';

export const COMPARABILITY_ISSUE_LABELS: Record<ComparabilityIssue, string> = {
  engine_version: 'Versão do motor diferente',
  scenario: 'Cenário diferente',
  scenario_revision: 'Revisão do cenário diferente',
  seed: 'Seed diferente',
  cast: 'Elenco ou atributos diferentes',
  items: 'Itens do cenário diferentes',
  distance: 'Distância diferente',
  tick: 'Passo de simulação diferente',
  variability_block: 'Bloco de variabilidade diferente',
};

function formatPercent(value: number): string {
  const rounded = Math.abs(value).toFixed(1);
  return `${rounded}%`;
}

function formatMeters(value: number): string {
  return `${Math.abs(Math.round(value))} m`;
}

/**
 * Frases derivadas de uma comparação já calculada. Nunca decide sozinha "qual
 * mudança causou o resultado": quando ordem e carga mudaram juntas, avisa que
 * a causa não pode ser isolada, em vez de escolher uma.
 */
export function generateComparisonFeedback(comparison: ComparisonResult): string[] {
  const sentences: string[] = [];

  if (!comparison.comparable) {
    const issueLabels = comparison.issues.map((issue) => COMPARABILITY_ISSUE_LABELS[issue]);
    sentences.push(
      `Comparação não controlada (${issueLabels.join(', ')}) — sem percentual de melhoria. ` +
        'Confira apenas o que mudou entre as configurações.',
    );
    return sentences;
  }

  if (comparison.improvementPct === null) {
    sentences.push(
      'Pelo menos uma das tentativas não chegou a um resultado concluído (timeout ou tentativa ' +
        'abandonada) — sem tempo total para comparar. Veja o progresso alcançado de cada uma.',
    );
    return sentences;
  }

  const timeVerb = comparison.improvementPct > 0 ? 'caiu' : comparison.improvementPct < 0 ? 'subiu' : 'não mudou';
  const spreadDelta = comparison.maxSpreadDeltaM ?? 0;
  const spreadVerb = spreadDelta > 0 ? 'aumentou' : spreadDelta < 0 ? 'diminuiu' : 'não mudou';

  if (comparison.improvementPct === 0) {
    sentences.push('O tempo total não mudou entre as duas tentativas.');
  } else {
    sentences.push(
      `O tempo ${timeVerb} ${formatPercent(comparison.improvementPct)}` +
        (spreadDelta !== 0
          ? `, enquanto a dispersão máxima ${spreadVerb} ${formatMeters(spreadDelta)}.`
          : ', e a dispersão máxima não mudou.'),
    );
  }

  if (comparison.changes.orderChanged && comparison.changes.loadChanged) {
    sentences.push(
      'Ordem e carga mudaram ao mesmo tempo nesta comparação — não dá para isolar qual das duas ' +
        'decisões produziu o efeito. Para isolar a causa, altere uma variável de cada vez.',
    );
  }

  return sentences;
}
