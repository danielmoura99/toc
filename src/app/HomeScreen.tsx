'use client';

/**
 * Tela inicial: escolher entre os dois exercícios independentes inspirados
 * em *A Meta* (guia da fábrica §2 — "seletor de exercícios"), e zerar os
 * dados salvos dos dois de uma vez, quando pedido explicitamente.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Factory, RotateCcw, Route } from 'lucide-react';

import { ConfirmDialog } from '@/features/trail/components/ConfirmDialog';
import { resetAllData } from './resetAllData';

export function HomeScreen() {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Exercícios inspirados em <cite>A Meta</cite>
        </p>
        <h1 className="text-2xl font-semibold">Qual exercício vamos rodar?</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/trilha"
          className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left hover:border-primary hover:bg-accent"
        >
          <Route className="size-6 text-primary" aria-hidden="true" />
          <span className="text-base font-semibold">Simulador da Trilha</span>
          <span className="text-sm text-muted-foreground">
            Eventos dependentes e flutuação estatística numa caminhada em grupo.
          </span>
        </Link>

        <Link
          href="/fabrica"
          className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left hover:border-primary hover:bg-accent"
        >
          <Factory className="size-6 text-primary" aria-hidden="true" />
          <span className="text-base font-semibold">Fábrica de componentes</span>
          <span className="text-sm text-muted-foreground">
            O mesmo mecanismo com tigelas, fósforos e dado.
          </span>
        </Link>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-destructive hover:text-destructive"
          onClick={() => setConfirmingReset(true)}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Zerar histórico
        </button>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title="Zerar todo o histórico salvo?"
          description="Isto apaga a preparação, o histórico e qualquer partida em andamento dos dois exercícios (Trilha e Fábrica de componentes) neste navegador. Não pode ser desfeito — exporte antes, se quiser guardar algo."
          confirmLabel="Zerar tudo"
          onConfirm={resetAllData}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
    </div>
  );
}
