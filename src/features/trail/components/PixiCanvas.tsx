'use client';

/**
 * Canvas PixiJS da trilha — carregado apenas no cliente via `next/dynamic`
 * com `ssr: false` a partir do componente que o importa (§10.3).
 *
 * A física não mora aqui. `stateRef` é lido a cada frame do próprio ticker do
 * Pixi, desacoplado da cadência de renderização do React: o HUD em HTML publica
 * a até 10 Hz, o canvas desenha na cadência disponível (§10.2).
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import type { AttemptConfig, SimulationState } from '../domain/types';
import { TrailScene, walkerSpecsFromConfig } from '../rendering/trailScene';
import { colorsForScenarioHex } from './characterColors';

interface PixiCanvasProps {
  config: AttemptConfig;
  /** Ref mutável, atualizada a cada tick pelo laço de física do componente pai. */
  stateRef: RefObject<SimulationState>;
}

export function PixiCanvas({ config, stateRef }: PixiCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Incrementar remonta o efeito de criação, permitindo "tentar novamente".
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let scene: TrailScene | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frameHandle = 0;

    const walkers = walkerSpecsFromConfig(config, colorsForScenarioHex(config.scenario));

    TrailScene.create({
      container: host,
      distanceM: config.scenario.distanceM,
      order: config.order,
      walkers,
    })
      .then((created) => {
        // Protege contra desmontagem antes da resolução da promise (§10.3).
        if (cancelled) {
          created.destroy();
          return;
        }

        scene = created;
        host.appendChild(created.canvas);
        setError(null);

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          created.resize(Math.round(width), Math.round(height));
        });
        resizeObserver.observe(host);

        // O canvas lê o snapshot mais recente a cada quadro, independente da
        // cadência de renderização do React (§10.2).
        const loop = () => {
          if (cancelled) return;
          created.render(stateRef.current);
          frameHandle = requestAnimationFrame(loop);
        };
        frameHandle = requestAnimationFrame(loop);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Falha desconhecida ao iniciar o renderizador.');
      });

    return () => {
      cancelled = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
      // No cleanup, remover listeners, ticker, canvas e recursos possuídos
      // pela instância (§10.3). Seguro sob React Strict Mode: a criação
      // assíncrona que ainda não resolveu é abortada pela flag `cancelled`.
      scene?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config e stateRef são estáveis por execução (snapshot congelado ao iniciar).
  }, [attempt]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center"
      >
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Não foi possível desenhar a trilha</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O histórico e os resultados desta tentativa não são afetados.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          onClick={() => {
            // `error` precisa voltar a null ANTES do efeito rodar de novo: só
            // assim o `<div ref={hostRef}>` volta a ser renderizado a tempo de
            // `hostRef.current` existir quando o efeito de criação disparar.
            // As duas chamadas ficam no mesmo lote de atualização do React.
            setError(null);
            setAttempt((current) => current + 1);
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Trilha com a posição atual de cada personagem. A tabela abaixo mostra os mesmos dados em texto."
      className="h-64 w-full overflow-hidden rounded-lg border bg-card sm:h-72"
    />
  );
}
