'use client';

/**
 * Histórico de partidas da fábrica (guia §9): número, data/hora,
 * participantes, etapas, horizonte, seed abreviada, entrega final e estoque.
 * Seleção de até três para comparação.
 */

import { ArrowLeft, GitCompare, Trash2 } from 'lucide-react';

import { MAX_COMPARISON_SELECTION, useHistoryStore } from '../application/historyStore';
import { formatDateTime } from '@/features/trail/components/format';
import { formatLots, interventionLabel } from './capacityText';

interface HistoryPanelProps {
  onBack: () => void;
  onCompare: () => void;
}

export function HistoryPanel({ onBack, onCompare }: HistoryPanelProps) {
  const history = useHistoryStore((s) => s.history);
  const selectedForComparison = useHistoryStore((s) => s.selectedForComparison);
  const pendingRun = useHistoryStore((s) => s.pendingRun);
  const toggleComparisonSelection = useHistoryStore((s) => s.toggleComparisonSelection);
  const removeRun = useHistoryStore((s) => s.removeRun);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Preparação
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          disabled={selectedForComparison.length < 2}
          onClick={onCompare}
        >
          <GitCompare className="size-4" aria-hidden="true" />
          Comparar ({selectedForComparison.length}/{MAX_COMPARISON_SELECTION})
        </button>
      </div>

      {pendingRun && (
        <div role="alert" className="rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          O histórico está cheio (20/20). A última partida concluída está pendente — exclua uma partida abaixo
          para registrá-la, ou ela continuará aguardando espaço.
        </div>
      )}

      {history.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma partida concluída ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-220 border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="w-10 p-3 font-medium">
                  <span className="sr-only">Selecionar</span>
                </th>
                <th scope="col" className="p-3 font-medium">#</th>
                <th scope="col" className="p-3 font-medium">Data/hora</th>
                <th scope="col" className="p-3 font-medium">Experiência · configuração</th>
                <th scope="col" className="p-3 font-medium">Setores</th>
                <th scope="col" className="p-3 font-medium">Horizonte</th>
                <th scope="col" className="p-3 font-medium">Seed</th>
                <th scope="col" className="p-3 font-medium">Entrega</th>
                <th scope="col" className="p-3 font-medium">Estoque</th>
                <th scope="col" className="p-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((run, index) => {
                const selected = selectedForComparison.includes(run.id);
                const participants = run.config.stages
                  .map((s) => s.participantName)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <tr key={run.id} className={`border-b last:border-0 ${selected ? 'bg-primary/5' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleComparisonSelection(run.id)}
                        aria-label={`Selecionar partida ${index + 1} para comparação`}
                      />
                    </td>
                    <td className="p-3 tabular-nums">{index + 1}</td>
                    <td className="p-3">{formatDateTime(run.createdAt)}</td>
                    <td className="p-3">
                      {run.config.experience === 'constraint-flow' ? (
                        <>
                          <span className="text-xs text-muted-foreground">Restrição e fluxo · </span>
                          <span className="font-medium">{interventionLabel(run.config)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{interventionLabel(run.config)}</span>
                      )}
                    </td>
                    <td className="p-3 tabular-nums" title={participants || undefined}>
                      {run.config.stages.length}
                      {participants && <span className="ml-1 text-xs text-muted-foreground">({participants})</span>}
                    </td>
                    <td className="p-3 tabular-nums">{run.config.rounds} dias</td>
                    <td className="p-3 font-mono text-xs">{run.config.seed.slice(0, 8)}</td>
                    <td className="p-3 tabular-nums">{formatLots(run.summary.delivered)}</td>
                    <td className="p-3 tabular-nums">{formatLots(run.summary.inventoryRemaining)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label={`Excluir partida ${index + 1}`}
                        onClick={() => removeRun(run.id)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
