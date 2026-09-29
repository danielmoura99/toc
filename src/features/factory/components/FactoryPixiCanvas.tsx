'use client';

/**
 * Canvas PixiJS da linha de produção — carregado apenas no cliente via
 * `next/dynamic` com `ssr: false` a partir do componente que o importa
 * (mesmo padrão da trilha, §10.3 do guia da trilha / §2 deste guia).
 *
 * Ao contrário da trilha (física contínua a 60 fps), aqui cada turno é
 * discreto e pouco frequente — a cena é redesenhada a cada mudança de
 * `state` (prop), não por um laço de `requestAnimationFrame` lendo uma ref.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { usePrefersReducedMotion } from '@/features/trail/components/usePrefersReducedMotion';

import type { CapacityProfile, Experience, ProductionLineState, StageDefinition } from '../domain/types';
import { FactoryScene } from '../rendering/factoryScene';

interface FactoryPixiCanvasProps {
  stages: StageDefinition[];
  experience: Experience;
  capacityProfiles: CapacityProfile[];
  state: ProductionLineState;
  activeStageIndex: number | null;
  running: boolean;
  tempoMs: number;
  onAnimatingChange: (busy: boolean) => void;
}

export function FactoryPixiCanvas({
  stages,
  experience,
  capacityProfiles,
  state,
  activeStageIndex,
  running,
  tempoMs,
  onAnimatingChange,
}: FactoryPixiCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sceneRef = useRef<FactoryScene | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const latest = useRef({ state, activeStageIndex, running, tempoMs, onAnimatingChange });

  useEffect(() => {
    const previous = latest.current;
    latest.current = { state, activeStageIndex, running, tempoMs, onAnimatingChange };
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    const turnsAdded = state.events.length - previous.state.events.length;
    scene.setTempo(running ? tempoMs * 0.8 : turnsAdded > 1 ? 300 : 1800);
    scene.render(state, activeStageIndex);
    if (previous.running && !running && previous.state.events.length === state.events.length) scene.settle();
  }, [state, activeStageIndex, running, tempoMs, onAnimatingChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let scene: FactoryScene | null = null;
    let resizeObserver: ResizeObserver | null = null;

    FactoryScene.create({ stages, experience, capacityProfiles, reducedMotion, onPresentation: (busy, index) => {
      if (cancelled) return;
      host.dataset.animating = String(busy);
      latest.current.onAnimatingChange(busy);
      if (scene) followStage(scene, host, index);
    } })
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        sceneRef.current = created;
        host.appendChild(created.canvas);
        created.fit(host.clientWidth);
        const snapshot = latest.current;
        created.setTempo(snapshot.running ? snapshot.tempoMs * 0.8 : 1800);
        created.render(snapshot.state, snapshot.activeStageIndex);
        created.settle();
        followStage(created, host, snapshot.activeStageIndex);
        setError(null);

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          created.fit(Math.round(entry.contentRect.width));
          followStage(created, host, latest.current.activeStageIndex);
        });
        resizeObserver.observe(host);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        latest.current.onAnimatingChange(false);
        setError(cause instanceof Error ? cause.message : 'Falha desconhecida ao iniciar o renderizador.');
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      sceneRef.current = null;
      scene?.destroy();
    };
  }, [attempt, stages, experience, capacityProfiles, reducedMotion]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center"
      >
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Não foi possível desenhar a linha de produção</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O histórico e os resultados desta partida não são afetados — a tabela abaixo mostra os mesmos dados em texto.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          onClick={() => {
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
      tabIndex={0}
      role="img"
      aria-label="Linha de produção com a fila de cada setor. A tabela abaixo mostra os mesmos dados em texto."
      className="max-h-[72vh] min-h-40 w-full overflow-auto rounded-lg border bg-card focus-visible:outline-2"
    />
  );
}

function followStage(scene: FactoryScene, host: HTMLDivElement, index: number | null) {
  if (index === null) return;
  const center = scene.stationCenterX(index);
  if (center < host.scrollLeft + 90 || center > host.scrollLeft + host.clientWidth - 90) {
    host.scrollLeft = Math.max(0, center - host.clientWidth / 2);
  }
  const centerY = scene.stationCenterY(index);
  if (centerY < host.scrollTop + 100 || centerY > host.scrollTop + host.clientHeight - 100) {
    host.scrollTop = Math.max(0, centerY - host.clientHeight / 2);
  }
}
