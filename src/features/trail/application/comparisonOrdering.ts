/**
 * Ordem e identificação das tentativas na tela de comparação.
 *
 * Separado de `ComparisonPanel` porque é lógica pura, testável sem
 * renderizar nada — a mesma razão pela qual `feedback.ts` já mora aqui.
 */

import type { AttemptResult } from '../domain/types';
import { getStage } from './stages';

/**
 * Ordena as tentativas selecionadas para comparação: a referência, quando
 * fizer parte da seleção, sempre primeiro — a mesma regra de sempre (§4.1);
 * sem ela na seleção, a primeira tentativa escolhida. As demais aparecem em
 * ordem cronológica real do histórico (mais antiga primeiro), não na ordem
 * em que foram clicadas na seleção (ajuste de navegação, 22/09/2026: a
 * numeração das colunas não representava a ordem em que as tentativas
 * aconteceram).
 */
export function orderAttemptsForComparison(
  selectedAttempts: AttemptResult[],
  history: AttemptResult[],
  referenceAttemptId: string | null,
): AttemptResult[] {
  const chronologicalIndex = (attempt: AttemptResult) =>
    history.findIndex((candidate) => candidate.id === attempt.id);

  const baseline = referenceAttemptId
    ? (selectedAttempts.find((attempt) => attempt.id === referenceAttemptId) ?? selectedAttempts[0])
    : selectedAttempts[0];

  if (!baseline) return [];

  return [
    baseline,
    ...selectedAttempts
      .filter((attempt) => attempt.id !== baseline.id)
      .sort((a, b) => chronologicalIndex(a) - chronologicalIndex(b)),
  ];
}

/**
 * "Tentativa N · Etapa[ — Referência]" — N é a posição cronológica real no
 * histórico (1 = a mais antiga), não a posição na seleção ou na coluna. O
 * mesmo texto identifica a tentativa tanto no cabeçalho da tabela quanto no
 * comentário de comparação abaixo dela.
 */
export function attemptLabel(attempt: AttemptResult, history: AttemptResult[], isReference: boolean): string {
  const position = history.findIndex((candidate) => candidate.id === attempt.id) + 1;
  const stageTitle = getStage(attempt.config.guidedStage).title;
  return `Tentativa ${position} · ${stageTitle}${isReference ? ' — Referência' : ''}`;
}
