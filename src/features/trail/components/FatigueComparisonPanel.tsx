'use client';

/**
 * Comparação específica de efeito da fadiga (§7.3 da evolução pedagógica) —
 * distinta da comparação de estratégias em `ComparisonPanel`. Sempre
 * "com − sem fadiga", rotulada "Efeito observado da fadiga".
 */

import { ArrowLeft } from 'lucide-react';

import { validateFatiguePair } from '../application/fatigueExperiment';
import { isSmallTimeDifference, signedDifference } from '../application/variabilityExperiment';
import { useAttemptsStore } from '../application/attemptsStore';
import type { CharacterId } from '../domain/types';
import { characterLabel } from './characterLabel';
import { formatClock } from './format';

interface FatigueComparisonPanelProps {
  /** ID da tentativa "com fadiga" — a origem é encontrada por `experimentOf`. */
  experimentalAttemptId: string;
  onBack: () => void;
}

export function FatigueComparisonPanel({ experimentalAttemptId, onBack }: FatigueComparisonPanelProps) {
  const history = useAttemptsStore((state) => state.history);
  const withFatigue = history.find((attempt) => attempt.id === experimentalAttemptId);
  const withoutFatigue = withFatigue?.config.experimentOf
    ? history.find((attempt) => attempt.id === withFatigue.config.experimentOf!.originAttemptId)
    : undefined;

  if (!withFatigue || !withoutFatigue) {
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

  const validation = validateFatiguePair(withoutFatigue, withFatigue);
  const characterIds: CharacterId[] = withoutFatigue.config.order;

  const timeDelta = signedDifference(withFatigue.totalTimeSec, withoutFatigue.totalTimeSec);
  const maxSpreadDelta = withFatigue.metrics.maxSpreadM - withoutFatigue.metrics.maxSpreadM;
  const meanSpreadDelta = withFatigue.metrics.meanSpreadM - withoutFatigue.metrics.meanSpreadM;
  const small = isSmallTimeDifference(timeDelta, withFatigue.totalTimeSec);

  return (
    <div className="flex flex-col gap-5">
      <BackButton onBack={onBack} />

      {!validation.ok && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Este par não é um experimento de fadiga válido</p>
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
              <th className="p-3 font-medium">Com fadiga</th>
              <th className="p-3 font-medium">Sem fadiga</th>
              <th className="p-3 font-medium">Efeito observado (com − sem)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Tempo total
              </th>
              <td className="p-3 tabular-nums">
                {withFatigue.outcome === 'completed' ? formatClock(withFatigue.totalTimeSec!) : 'timeout'}
              </td>
              <td className="p-3 tabular-nums">
                {withoutFatigue.outcome === 'completed' ? formatClock(withoutFatigue.totalTimeSec!) : 'timeout'}
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
              <td className="p-3 tabular-nums">{Math.round(withFatigue.metrics.maxSpreadM)} m</td>
              <td className="p-3 tabular-nums">{Math.round(withoutFatigue.metrics.maxSpreadM)} m</td>
              <td className="p-3 tabular-nums">
                {maxSpreadDelta >= 0 ? '+' : '−'}
                {Math.round(Math.abs(maxSpreadDelta))} m
              </td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                Dispersão média
              </th>
              <td className="p-3 tabular-nums">{Math.round(withFatigue.metrics.meanSpreadM)} m</td>
              <td className="p-3 tabular-nums">{Math.round(withoutFatigue.metrics.meanSpreadM)} m</td>
              <td className="p-3 tabular-nums">
                {meanSpreadDelta >= 0 ? '+' : '−'}
                {Math.round(Math.abs(meanSpreadDelta))} m
              </td>
            </tr>

            {characterIds.map((characterId) => {
              const withLimited = withFatigue.metrics.limitedTimeByCharacter[characterId] ?? 0;
              const withoutLimited = withoutFatigue.metrics.limitedTimeByCharacter[characterId] ?? 0;
              const finalEnergyPct = (withFatigue.finalState.characters[characterId]?.energy ?? 1) * 100;

              return (
                <tr key={characterId} className="border-b last:border-0">
                  <th scope="row" className="p-3 text-left text-xs font-medium text-muted-foreground">
                    Limitação · {characterLabel(withFatigue.config, characterId)}
                  </th>
                  <td className="p-3 tabular-nums">{formatClock(withLimited)}</td>
                  <td className="p-3 tabular-nums">{formatClock(withoutLimited)}</td>
                  <td className="p-3 tabular-nums">
                    {withLimited - withoutLimited >= 0 ? '+' : '−'}
                    {formatClock(Math.abs(withLimited - withoutLimited))}
                    <span className="ml-2 text-xs text-muted-foreground">
                      (energia final com fadiga: {finalEnergyPct.toFixed(0)}%)
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p>
          Nesta comparação, apenas o modelo de fadiga foi ligado ou desligado — a mesma seed, ordem,
          carga e condição de variabilidade dos dois lados. O resultado descreve esta configuração e
          este modelo, não uma medida fisiológica real.
        </p>
        {small && (
          <p className="mt-2 text-xs text-muted-foreground">
            O efeito observado no tempo total é pequeno nesta execução.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Não há percentual de melhoria de estratégia entre condições de fadiga diferentes — só a
          diferença observada acima.
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
