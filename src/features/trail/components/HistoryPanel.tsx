'use client';

/**
 * Histórico de tentativas (§12) e ponto de entrada da comparação (§8.2).
 *
 * Até 20 tentativas, mais recente primeiro. Selecionar até 3 para comparar.
 * A exclusão é seletiva: nada é descartado sem o operador escolher.
 */

import { useState } from 'react';
import { BatteryWarning, CopyPlus, FlaskConical, Scale, Star, StarOff, Trash2 } from 'lucide-react';

import {
  MAX_COMPARISON_SELECTION,
  MAX_HISTORY_SIZE,
  useAttemptsStore,
} from '../application/attemptsStore';
import { getStage } from '../application/stages';
import { canStartFatigueExperiment } from '../application/fatigueExperiment';
import { reuseAttemptConfig } from '../application/sessionSync';
import { canStartVariabilityExperiment } from '../application/variabilityExperiment';
import { scenarioDisplayLabel } from '../scenarios';
import type { AttemptResult } from '../domain/types';
import { characterLabel } from './characterLabel';
import { formatClock, formatDateTime } from './format';

interface HistoryPanelProps {
  onCompare: () => void;
  /** Chamado depois que reutilizar uma configuração aplica com sucesso. */
  onReused: () => void;
  /** Inicia o experimento "com e sem variabilidade" a partir desta tentativa. */
  onStartVariabilityExperiment: (attempt: AttemptResult) => void;
  /** Abre a comparação específica de variabilidade para esta tentativa experimental. */
  onViewVariabilityComparison: (experimentalAttemptId: string) => void;
  /** Inicia o experimento "com e sem fadiga" a partir desta tentativa. */
  onStartFatigueExperiment: (attempt: AttemptResult) => void;
  /** Abre a comparação específica de fadiga para esta tentativa experimental. */
  onViewFatigueComparison: (experimentalAttemptId: string) => void;
}

export function HistoryPanel({
  onCompare,
  onReused,
  onStartVariabilityExperiment,
  onViewVariabilityComparison,
  onStartFatigueExperiment,
  onViewFatigueComparison,
}: HistoryPanelProps) {
  const history = useAttemptsStore((state) => state.history);
  const referenceAttemptId = useAttemptsStore((state) => state.referenceAttemptId);
  const selectedForComparison = useAttemptsStore((state) => state.selectedForComparison);
  const toggleComparisonSelection = useAttemptsStore((state) => state.toggleComparisonSelection);
  const setReferenceAttempt = useAttemptsStore((state) => state.setReferenceAttempt);
  const removeAttempt = useAttemptsStore((state) => state.removeAttempt);
  const [reuseError, setReuseError] = useState<string[] | null>(null);

  const handleReuse = (attempt: AttemptResult) => {
    const result = reuseAttemptConfig(attempt);
    if (result.ok) {
      setReuseError(null);
      onReused();
    } else {
      setReuseError(result.issues);
    }
  };

  // Mais recente primeiro na tela; o domínio guarda em ordem de conclusão.
  const displayed = [...history].reverse();

  if (history.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhuma tentativa concluída ainda. Prepare e rode uma tentativa para começar o histórico.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
        <p className="text-sm">
          <span className="font-medium tabular-nums">{history.length}</span> /{' '}
          <span className="tabular-nums">{MAX_HISTORY_SIZE}</span> tentativas registradas ·{' '}
          <span className="tabular-nums">{selectedForComparison.length}</span> /{' '}
          <span className="tabular-nums">{MAX_COMPARISON_SELECTION}</span> selecionadas para
          comparação
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          disabled={selectedForComparison.length < 2}
          onClick={onCompare}
        >
          <Scale className="size-3.5" aria-hidden="true" />
          Comparar selecionadas
        </button>
      </div>

      {history.length >= MAX_HISTORY_SIZE && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Histórico cheio. Exclua tentativas antigas para registrar novas.
        </p>
      )}

      {reuseError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">Não foi possível reutilizar essa configuração</p>
          <ul className="mt-1 list-inside list-disc">
            {reuseError.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {displayed.map((attempt) => (
          <HistoryRow
            key={attempt.id}
            attempt={attempt}
            isReference={attempt.id === referenceAttemptId}
            isSelected={selectedForComparison.includes(attempt.id)}
            onToggleSelect={() => toggleComparisonSelection(attempt.id)}
            onSetReference={() => setReferenceAttempt(attempt.id)}
            onRemove={() => removeAttempt(attempt.id)}
            onReuse={() => handleReuse(attempt)}
            onStartVariabilityExperiment={() => onStartVariabilityExperiment(attempt)}
            onViewVariabilityComparison={() => onViewVariabilityComparison(attempt.id)}
            onStartFatigueExperiment={() => onStartFatigueExperiment(attempt)}
            onViewFatigueComparison={() => onViewFatigueComparison(attempt.id)}
          />
        ))}
      </ul>
    </div>
  );
}

interface HistoryRowProps {
  attempt: AttemptResult;
  isReference: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSetReference: () => void;
  onRemove: () => void;
  onReuse: () => void;
  onStartVariabilityExperiment: () => void;
  onViewVariabilityComparison: () => void;
  onStartFatigueExperiment: () => void;
  onViewFatigueComparison: () => void;
}

function HistoryRow({
  attempt,
  isReference,
  isSelected,
  onToggleSelect,
  onSetReference,
  onRemove,
  onReuse,
  onStartVariabilityExperiment,
  onViewVariabilityComparison,
  onStartFatigueExperiment,
  onViewFatigueComparison,
}: HistoryRowProps) {
  const definition = getStage(attempt.config.guidedStage);
  const orderNames = attempt.config.order.map((id) => characterLabel(attempt.config, id)).join(' → ');
  const isVariabilityExperiment = attempt.config.experimentOf?.kind === 'variability';
  const isFatigueExperiment = attempt.config.experimentOf?.kind === 'fatigue';
  const variabilityEligibility = canStartVariabilityExperiment(attempt);
  const fatigueEligibility = canStartFatigueExperiment(attempt);

  return (
    <li
      data-testid={`history-${attempt.id}`}
      className={`flex flex-wrap items-start gap-3 rounded-lg border bg-background p-3 ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
    >
      <label className="flex items-center gap-2 pt-0.5">
        <span className="sr-only">Selecionar tentativa de {formatDateTime(attempt.createdAt)}</span>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="size-4" />
      </label>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
            Etapa {attempt.config.guidedStage} — {definition.title}
          </span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
            {scenarioDisplayLabel(attempt.config.scenario.id)}
          </span>
          {isReference && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
              <Star className="size-3" aria-hidden="true" />
              Referência inicial
            </span>
          )}
          {isVariabilityExperiment && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900">
              <FlaskConical className="size-3" aria-hidden="true" />
              Experimento: sem variabilidade
            </span>
          )}
          {isFatigueExperiment && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-900">
              <BatteryWarning className="size-3" aria-hidden="true" />
              Experimento: com fadiga
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formatDateTime(attempt.createdAt)}</span>
        </div>

        <p className="mt-1 truncate text-xs text-muted-foreground" title={orderNames}>
          {orderNames}
        </p>

        {attempt.config.hypothesis && (
          <p className="mt-1 text-xs italic text-muted-foreground">“{attempt.config.hypothesis}”</p>
        )}

        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {attempt.outcome === 'completed' ? (
            <span>
              Tempo total: <strong>{formatClock(attempt.totalTimeSec!)}</strong>
            </span>
          ) : (
            <span className="font-medium text-amber-700">
              Timeout · {attempt.metrics.collectiveProgressPct.toFixed(1)}% do percurso
            </span>
          )}
          <span>Dispersão máx.: {Math.round(attempt.metrics.maxSpreadM)} m</span>
          <span>Seed: <code className="font-mono">{attempt.config.seed}</code></span>
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        {isVariabilityExperiment ? (
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            title="Ver comparação de variabilidade"
            aria-label={`Ver comparação de variabilidade da tentativa de ${formatDateTime(attempt.createdAt)}`}
            onClick={onViewVariabilityComparison}
          >
            <Scale className="size-4" />
          </button>
        ) : (
          variabilityEligibility.ok && (
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              title="Comparar com e sem variabilidade"
              aria-label={`Comparar com e sem variabilidade a partir da tentativa de ${formatDateTime(attempt.createdAt)}`}
              onClick={onStartVariabilityExperiment}
            >
              <FlaskConical className="size-4" />
            </button>
          )
        )}
        {isFatigueExperiment ? (
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            title="Ver comparação de fadiga"
            aria-label={`Ver comparação de fadiga da tentativa de ${formatDateTime(attempt.createdAt)}`}
            onClick={onViewFatigueComparison}
          >
            <BatteryWarning className="size-4" />
          </button>
        ) : (
          fatigueEligibility.ok && (
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              title="Experimentar com fadiga"
              aria-label={`Experimentar com fadiga a partir da tentativa de ${formatDateTime(attempt.createdAt)}`}
              onClick={onStartFatigueExperiment}
            >
              <BatteryWarning className="size-4" />
            </button>
          )
        )}
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          title="Levar esta ordem e estas mochilas de volta para a preparação"
          aria-label={`Reutilizar a configuração da tentativa de ${formatDateTime(attempt.createdAt)}`}
          onClick={onReuse}
        >
          <CopyPlus className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          title={isReference ? 'Já é a referência' : 'Definir como referência'}
          aria-label={
            isReference
              ? `${orderNames} já é a referência`
              : `Definir tentativa de ${formatDateTime(attempt.createdAt)} como referência`
          }
          disabled={isReference}
          onClick={onSetReference}
        >
          {isReference ? <Star className="size-4" /> : <StarOff className="size-4" />}
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Excluir tentativa de ${formatDateTime(attempt.createdAt)}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
