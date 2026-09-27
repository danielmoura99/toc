'use client';

/**
 * Raiz da experiência da Fábrica de componentes.
 *
 * Alterna entre preparação, execução, histórico e comparação. Persistência
 * própria, independente da trilha (TG12): restaura do localStorage uma vez
 * ao montar, salva a preparação com um pequeno atraso depois de
 * mudanças confirmadas, e salva histórico e execução IMEDIATAMENTE após
 * cada turno confirmado (§9) — sem atraso, porque perder um turno já
 * confirmado entre o clique e o salvamento violaria "recuperar o estado
 * correto, pausado" (TG07) exatamente no turno que acabou de acontecer.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { History, Home, ListChecks, Route } from 'lucide-react';

import type { ProductionLineConfig } from '../domain/types';
import { useHistoryStore } from '../application/historyStore';
import { usePreparationStore } from '../application/preparationStore';
import { useRunStore } from '../application/runStore';
import { usePersistenceStatusStore } from '../application/persistenceStatusStore';
import { applySessionPayload, restoreSessionFromStorage, saveCurrentSession } from '../application/sessionSync';
import { ComparisonPanel } from './ComparisonPanel';
import { HistoryPanel } from './HistoryPanel';
import { PersistenceBanner } from './PersistenceBanner';
import { Preparation } from './Preparation';
import { ProductionLine } from './ProductionLine';
import { SessionMenu } from './SessionMenu';
import { ConfirmDialog } from '@/features/trail/components/ConfirmDialog';
import { PendingRunNotice } from './PendingRunNotice';

type View = 'preparation' | 'running' | 'history' | 'comparison';

const VIEW_TITLES: Record<View, string> = {
  preparation: 'Preparação da partida',
  running: 'Linha de produção',
  history: 'Histórico de partidas',
  comparison: 'Comparação de partidas',
};

const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * `restoreSessionFromStorage` só lê e valida — não muta nenhuma store —
 * então pode ser chamado no inicializador de `useState` do componente
 * montado depois da hidratação, para decidir sua tela inicial. Aplicar o resultado
 * (mutar as stores) continua acontecendo no efeito abaixo, protegido contra
 * a dupla invocação do Strict Mode.
 */
function initialViewFromStorage(): View {
  const outcome = restoreSessionFromStorage();
  return outcome.ok && outcome.payload.activeRun ? 'running' : 'preparation';
}

function initialRunningConfigFromStorage(): ProductionLineConfig | null {
  const outcome = restoreSessionFromStorage();
  return outcome.ok && outcome.payload.activeRun ? outcome.payload.activeRun.config : null;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function FactoryExperience() {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  // A sessão local só existe no navegador. O primeiro HTML precisa coincidir
  // com o servidor, antes de escolher a tela a partir da partida salva.
  if (!hydrated) return <p role="status" className="p-6">Carregando fábrica…</p>;
  return <RestoredFactoryExperience />;
}

function RestoredFactoryExperience() {
  const [view, setView] = useState<View>(initialViewFromStorage);
  const [runningConfig, setRunningConfig] = useState<ProductionLineConfig | null>(initialRunningConfigFromStorage);
  const [replacement, setReplacement] = useState<ProductionLineConfig | null>(null);

  const historyCount = useHistoryStore((s) => s.history.length);
  const activeState = useRunStore((s) => s.state);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const outcome = restoreSessionFromStorage();
    usePersistenceStatusStore.getState().setRestoreOutcome(outcome);

    if (outcome.ok) {
      applySessionPayload(outcome.payload);
    }
  }, []);

  // Preparação tem debounce; alterações do histórico são persistidas na
  // mesma ação para preservar conclusões, exclusões e a partida pendente.
  useEffect(() => {
    let timeoutId: number | undefined;
    const scheduleSave = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const outcome = saveCurrentSession();
        usePersistenceStatusStore.getState().setSaveOutcome(outcome);
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubscribePreparation = usePreparationStore.subscribe(scheduleSave);
    const unsubscribeHistory = useHistoryStore.subscribe(() => {
      usePersistenceStatusStore.getState().setSaveOutcome(saveCurrentSession());
    });

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      unsubscribePreparation();
      unsubscribeHistory();
    };
  }, []);

  // Execução: salva imediatamente a cada turno confirmado (§9) — sem atraso.
  useEffect(() => {
    const unsubscribeRun = useRunStore.subscribe((state, previous) => {
      if (state.state === previous.state) return;
      const outcome = saveCurrentSession();
      usePersistenceStatusStore.getState().setSaveOutcome(outcome);
    });
    return unsubscribeRun;
  }, []);

  const start = (config: ProductionLineConfig) => {
    // Único lugar que chama `startRun` para uma partida NOVA — a restauração
    // (efeito acima) chama `resumeRun` em vez disso. `ProductionLine` nunca
    // inicia sozinho, evitando a corrida entre efeito de filho e de pai.
    if (!useRunStore.getState().startRun(config)) return;
    setRunningConfig(config);
    setView('running');
  };

  const requestStart = (config: ProductionLineConfig) => {
    const current = useRunStore.getState().state;
    if (current?.status === 'active' && current.events.length > 0) {
      useRunStore.getState().pause();
      setReplacement(structuredClone(config));
      return;
    }
    start(config);
  };

  const backToPreparation = () => {
    setRunningConfig(null);
    setView('preparation');
  };

  const goToPreparation = () => setView('preparation');
  const goToHistory = () => {
    useRunStore.getState().pause();
    setView('history');
  };
  const goToComparison = () => setView('comparison');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fábrica de componentes</p>
          <h1 className="text-2xl font-semibold">{VIEW_TITLES[view]}</h1>
          <p className="text-sm text-muted-foreground">Fluxo de componentes aeronáuticos — exercício inspirado em A Meta</p>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {view !== 'running' && activeState?.status === 'active' && (
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => {
              setRunningConfig(useRunStore.getState().config);
              setView('running');
            }}>Retomar partida</button>
          )}
          {view !== 'running' && view !== 'preparation' && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={goToPreparation}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              Preparação
            </button>
          )}
          {view !== 'running' && historyCount > 0 && view !== 'history' && view !== 'comparison' && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={goToHistory}
            >
              <History className="size-4" aria-hidden="true" />
              Histórico ({historyCount})
            </button>
          )}
          <SessionMenu />
          {/* Seletor de exercícios: leva de volta ao Simulador da Trilha —
              sessão e persistência próprias, independentes (TG12). */}
          <Link
            href="/trilha"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Route className="size-4" aria-hidden="true" />
            Simulador da Trilha
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Home className="size-4" aria-hidden="true" />
            Início
          </Link>
        </nav>
      </header>

      <PersistenceBanner />
      {view !== 'running' && <PendingRunNotice />}

      {replacement && <ConfirmDialog
        title="Substituir a partida em andamento?"
        description="O progresso atual será descartado. As partidas concluídas permanecem no histórico."
        confirmLabel="Descartar e iniciar nova"
        onConfirm={() => { start(replacement); setReplacement(null); }}
        onCancel={() => setReplacement(null)}
      />}

      {view === 'preparation' && <Preparation onStart={requestStart} onViewHistory={goToHistory} />}

      {view === 'running' && runningConfig && (
        <ProductionLine
          config={runningConfig}
          onBackToPreparation={backToPreparation}
          onViewHistory={goToHistory}
          onCompare={(runId) => {
            useHistoryStore.getState().clearComparisonSelection();
            useHistoryStore.getState().toggleComparisonSelection(runId);
            // Vai para o histórico, não direto à comparação: falta escolher
            // pelo menos uma segunda partida para comparar com esta.
            goToHistory();
          }}
        />
      )}

      {view === 'history' && <HistoryPanel onBack={goToPreparation} onCompare={goToComparison} />}

      {view === 'comparison' && <ComparisonPanel onBack={goToHistory} />}
    </div>
  );
}
