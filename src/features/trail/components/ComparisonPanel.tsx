'use client';

/**
 * Comparação entre até três tentativas (§8.2) e perguntas para discussão (§8.3).
 *
 * A primeira coluna é a base da comparação — por padrão, a tentativa mais à
 * esquerda escolhida na seleção. Cada coluna seguinte mostra o que mudou em
 * relação a ela, e só recebe percentual de melhoria quando a comparação é
 * controlada (mesmo motor, cenário, revisão, seed, elenco, itens, distância,
 * passo e bloco de variabilidade — ordem e dono dos itens podem mudar).
 */

import { ArrowLeft } from 'lucide-react';

import { useAttemptsStore } from '../application/attemptsStore';
import { scenarioDisplayLabel } from '../scenarios';
import { generateComparisonFeedback, COMPARABILITY_ISSUE_LABELS } from '../application/feedback';
import { compareAttempts } from '../domain/metrics';
import type { AttemptResult, CharacterId } from '../domain/types';
import { formatClock, formatDateTime } from './format';

const DISCUSSION_QUESTIONS = [
  'Qual era a hipótese e o que os resultados sustentam?',
  'Quem tinha capacidade disponível, mas não conseguia utilizá-la?',
  'A mudança reduziu dispersão, tempo ou ambos?',
  'Onde retirar carga ajudou mais? Onde acrescentá-la criou um novo problema?',
  'O que essa situação representa no trabalho e onde a analogia deixa de valer?',
];

interface ComparisonPanelProps {
  onBack: () => void;
}

export function ComparisonPanel({ onBack }: ComparisonPanelProps) {
  const history = useAttemptsStore((state) => state.history);
  const selectedForComparison = useAttemptsStore((state) => state.selectedForComparison);

  const referenceAttemptId = useAttemptsStore((state) => state.referenceAttemptId);

  const selectedAttempts = selectedForComparison
    .map((id) => history.find((attempt) => attempt.id === id))
    .filter((attempt): attempt is AttemptResult => attempt !== undefined);

  // A referência inicial, quando faz parte da seleção, é sempre a base da
  // comparação — é para isso que ela existe (§4.1). Sem ela na seleção, a
  // base é simplesmente a primeira tentativa escolhida.
  const attempts = referenceAttemptId
    ? [
        ...selectedAttempts.filter((attempt) => attempt.id === referenceAttemptId),
        ...selectedAttempts.filter((attempt) => attempt.id !== referenceAttemptId),
      ]
    : selectedAttempts;

  if (attempts.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={onBack} />
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Selecione ao menos duas tentativas no histórico para comparar.
        </div>
      </div>
    );
  }

  const baseline = attempts[0];
  const characterIds: CharacterId[] = baseline.config.order;

  return (
    <div className="flex flex-col gap-5">
      <BackButton onBack={onBack} />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-32 p-3 font-medium">Tentativa</th>
              {attempts.map((attempt, index) => (
                <th key={attempt.id} className="p-3 font-medium">
                  {index === 0 ? 'Base' : `#${index + 1}`} ·{' '}
                  {scenarioDisplayLabel(attempt.config.scenario.id)}
                  <span className="mt-0.5 block font-normal">{formatDateTime(attempt.createdAt)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b align-top">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Ordem
              </th>
              {attempts.map((attempt) => (
                <td key={attempt.id} className="p-3 text-xs">
                  {attempt.config.order
                    .map((id) => attempt.config.scenario.characters.find((c) => c.id === id)?.displayName)
                    .join(' → ')}
                </td>
              ))}
            </tr>

            {characterIds.map((characterId) => {
              const displayName =
                baseline.config.scenario.characters.find((c) => c.id === characterId)?.displayName ??
                characterId;

              return (
                <tr key={characterId} className="border-b">
                  <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                    Carga · {displayName}
                  </th>
                  {attempts.map((attempt) => (
                    <td key={attempt.id} className="p-3 tabular-nums">
                      {attempt.metrics.loadKgByCharacter[characterId] ?? '—'} kg
                    </td>
                  ))}
                </tr>
              );
            })}

            <tr className="border-b align-top">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Hipótese
              </th>
              {attempts.map((attempt) => (
                <td key={attempt.id} className="p-3 text-xs italic text-muted-foreground">
                  {attempt.config.hypothesis ? `“${attempt.config.hypothesis}”` : '—'}
                </td>
              ))}
            </tr>

            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Tempo total
              </th>
              {attempts.map((attempt) => (
                <td key={attempt.id} className="p-3 font-medium tabular-nums">
                  {attempt.outcome === 'completed' ? (
                    formatClock(attempt.totalTimeSec!)
                  ) : (
                    <span className="font-normal text-amber-700">
                      timeout · {attempt.metrics.collectiveProgressPct.toFixed(1)}%
                    </span>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Dispersão máx. / média
              </th>
              {attempts.map((attempt) => (
                <td key={attempt.id} className="p-3 tabular-nums">
                  {Math.round(attempt.metrics.maxSpreadM)} m / {Math.round(attempt.metrics.meanSpreadM)} m
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Uma comparação por coluna, sempre contra a base (a primeira selecionada). */}
      <div className="flex flex-col gap-3">
        {attempts.slice(1).map((attempt, index) => (
          <ComparisonAgainstBaseline
            key={attempt.id}
            label={`#${index + 2}`}
            baseline={baseline}
            current={attempt}
          />
        ))}
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Perguntas para discussão</h2>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {DISCUSSION_QUESTIONS.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ComparisonAgainstBaseline({
  label,
  baseline,
  current,
}: {
  label: string;
  baseline: AttemptResult;
  current: AttemptResult;
}) {
  const comparison = compareAttempts(baseline, current);
  const feedback = generateComparisonFeedback(comparison);

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">
        {label} em relação à base
        {!comparison.comparable && (
          <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {comparison.issues.map((issue) => COMPARABILITY_ISSUE_LABELS[issue]).join(', ')}
          </span>
        )}
      </h3>

      <ul className="mt-2 space-y-1 text-sm">
        {feedback.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>

      {comparison.comparable && (comparison.changes.orderChanged || comparison.changes.loadChanged) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Mudou: {comparison.changes.orderChanged && 'ordem da fila'}
          {comparison.changes.orderChanged && comparison.changes.loadChanged && ' e '}
          {comparison.changes.loadChanged && 'distribuição de carga'}.
        </p>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      onClick={onBack}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Histórico
    </button>
  );
}
