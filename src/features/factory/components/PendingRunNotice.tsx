'use client';

import { useHistoryStore } from '../application/historyStore';

export function PendingRunNotice() {
  const pending = useHistoryStore((s) => s.pendingRun);
  if (!pending) return null;
  return (
    <p role="alert" className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50">
      Histórico cheio (20/20). A última partida foi preservada e está incluída na exportação.
      Exporte a sessão para guardar os resultados e exclua uma partida no histórico para liberar espaço.
      Novas partidas, repetições e o avanço de partidas recuperadas ficam bloqueados até resolver essa pendência.
    </p>
  );
}
