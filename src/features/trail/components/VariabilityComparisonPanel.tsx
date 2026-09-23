'use client';

/**
 * Comparação específica de efeito da variabilidade (§4.3 da evolução
 * pedagógica) — distinta da comparação de estratégias em `ComparisonPanel`.
 * Sempre "com − sem", rotulada "Diferença observada".
 */

import { ArrowLeft } from 'lucide-react';

import { useAttemptsStore } from '../application/attemptsStore';
import {
  isSmallTimeDifference,
  signedDifference,
  validateVariabilityPair,
} from '../application/variabilityExperiment';
import type { CharacterId } from '../domain/types';
import { characterLabel } from './characterLabel';
import { formatClock } from './format';

interface VariabilityComparisonPanelProps {
  /** ID da tentativa "sem variabilidade" — a origem é encontrada por `experimentOf`. */
  experimentalAttemptId: string;
  onBack: () => void;
}

export function VariabilityComparisonPanel({ experimentalAttemptId, onBack }: VariabilityComparisonPanelProps) {
  const history = useAttemptsStore((state) => state.history);
  const withoutVariability = history.find((attempt) => attempt.id === experimentalAttemptId);
  const withVariability = withoutVariability?.config.experimentOf
    ? history.find((attempt) => attempt.id === withoutVariability.config.experimentOf!.originAttemptId)
    : undefined;

  if (!withoutVariability || !withVariability) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={onBack} />
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Não foi possível encontrar as duas condições deste experimento no histórico atual — uma
          delas pode ter sido excluída.
        </div>
      </div>
    );
  }

  const validation = validateVariabilityPair(withVariability, withoutVariability);
  const characterIds: CharacterId[] = withVariability.config.order;

  const timeDelta = signedDifference(withVariability.totalTimeSec, withoutVariability.totalTimeSec);
  const maxSpreadDelta = withVariability.metrics.maxSpreadM - withoutVariability.metrics.maxSpreadM;
  const meanSpreadDelta = withVariability.metrics.meanSpreadM - withoutVariability.metrics.meanSpreadM;
  const small = isSmallTimeDifference(timeDelta, withVariability.totalTimeSec);

  return (
    <div className="flex flex-col gap-5">
      <BackButton onBack={onBack} />

      {!validation.ok && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Este par não é um experimento de variabilidade válido</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {validation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-140 border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-40 p-3 font-medium">Condição</th>
              <th className="p-3 font-medium">Com variabilidade</th>
              <th className="p-3 font-medium">Sem variabilidade</th>
              <th className="p-3 font-medium">Diferença observada (com − sem)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Tempo total
              </th>
              <td className="p-3 tabular-nums">
                {withVariability.outcome === 'completed' ? formatClock(withVariability.totalTimeSec!) : 'timeout'}
              </td>
              <td className="p-3 tabular-nums">
                {withoutVariability.outcome === 'completed'
                  ? formatClock(withoutVariability.totalTimeSec!)
                  : 'timeout'}
              </td>
              <td className="p-3 tabular-nums">
                {timeDelta === null
                  ? '— (pelo menos uma condição não concluiu)'
                  : `${timeDelta >= 0 ? '+' : '−'}${formatClock(Math.abs(timeDelta))}${small ? ' (pequena)' : ''}`}
              </td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Dispersão máxima
              </th>
              <td className="p-3 tabular-nums">{Math.round(withVariability.metrics.maxSpreadM)} m</td>
              <td className="p-3 tabular-nums">{Math.round(withoutVariability.metrics.maxSpreadM)} m</td>
              <td className="p-3 tabular-nums">
                {maxSpreadDelta >= 0 ? '+' : '−'}
                {Math.round(Math.abs(maxSpreadDelta))} m
              </td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Dispersão média
              </th>
              <td className="p-3 tabular-nums">{Math.round(withVariability.metrics.meanSpreadM)} m</td>
              <td className="p-3 tabular-nums">{Math.round(withoutVariability.metrics.meanSpreadM)} m</td>
              <td className="p-3 tabular-nums">
                {meanSpreadDelta >= 0 ? '+' : '−'}
                {Math.round(Math.abs(meanSpreadDelta))} m
              </td>
            </tr>

            {characterIds.map((characterId) => {
              const withLimited = withVariability.metrics.limitedTimeByCharacter[characterId] ?? 0;
              const withoutLimited = withoutVariability.metrics.limitedTimeByCharacter[characterId] ?? 0;

              return (
                <tr key={characterId} className="border-b last:border-0">
                  <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                    Limitação · {characterLabel(withVariability.config, characterId)}
                  </th>
                  <td className="p-3 tabular-nums">{formatClock(withLimited)}</td>
                  <td className="p-3 tabular-nums">{formatClock(withoutLimited)}</td>
                  <td className="p-3 tabular-nums">
                    {withLimited - withoutLimited >= 0 ? '+' : '−'}
                    {formatClock(Math.abs(withLimited - withoutLimited))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p>
          Nesta comparação, apenas as flutuações foram retiradas. Os espaços que permanecem também
          podem decorrer das diferenças de capacidade. O resultado descreve esta configuração e esta
          sequência de variações.
        </p>
        {small && (
          <p className="mt-2 text-xs text-muted-foreground">
            A diferença observada no tempo total é pequena nesta execução.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Esta diferença não é uma decomposição exata ou universal da dispersão em causas
          independentes — desativar a variabilidade não é uma estratégia operacional de melhoria, é
          um recurso de observação.
        </p>
      </div>
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
