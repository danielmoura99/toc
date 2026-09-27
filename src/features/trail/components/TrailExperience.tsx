'use client';

/**
 * Raiz da experiência interativa.
 *
 * Alterna entre configuração de expedição, preparação, execução, histórico e
 * comparação. A configuração é congelada ao iniciar: o que roda é um
 * snapshot, não o rascunho vivo do store (R12). Voltar para a preparação não
 * altera uma tentativa já iniciada nem o histórico já registrado.
 *
 * Também é o único lugar que liga as stores à persistência (§12): restaura do
 * localStorage uma vez ao montar, e salva de novo sempre que a preparação ou o
 * histórico mudam — nunca a cada quadro, porque nada aqui escuta o laço de
 * física (esse continua isolado numa ref, como desde a entrega 3).
 *
 * A tela de configuração ('setup') é o ponto de entrada padrão — substitui a
 * antiga entrada direta num cenário fixo. Só é pulada quando uma sessão salva
 * é recuperada com sucesso ao montar.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Factory, History, Home, ListChecks } from 'lucide-react';

import type { AttemptConfig, AttemptResult } from '../domain/types';
import { useAttemptsStore } from '../application/attemptsStore';
import { usePreparationStore } from '../application/preparationStore';
import { usePersistenceStatusStore } from '../application/persistenceStatusStore';
import { restoreSessionFromStorage, applySessionPayload, saveCurrentSession } from '../application/sessionSync';
import { buildWithoutVariabilityConfig } from '../application/variabilityExperiment';
import { buildWithFatigueConfig } from '../application/fatigueExperiment';
import {
  clearActiveAttemptMarker,
  consumeInterruptedAttemptMarker,
  markAttemptActive,
} from '../persistence/localStorageAdapter';
import { ComparisonPanel } from './ComparisonPanel';
import { ExpeditionSetup } from './ExpeditionSetup';
import { FatigueComparisonPanel } from './FatigueComparisonPanel';
import { HistoryPanel } from './HistoryPanel';
import { PendingAttemptBanner } from './PendingAttemptBanner';
import { PersistenceBanner } from './PersistenceBanner';
import { Preparation } from './Preparation';
import { SessionMenu } from './SessionMenu';
import { TrailRun } from './TrailRun';
import { VariabilityComparisonPanel } from './VariabilityComparisonPanel';

type View =
  | 'setup'
  | 'preparation'
  | 'running'
  | 'history'
  | 'comparison'
  | 'variability-comparison'
  | 'fatigue-comparison';

const VIEW_TITLES: Record<View, string> = {
  setup: 'Nova expedição',
  preparation: 'Preparação da tentativa',
  running: 'Caminhada do grupo',
  history: 'Histórico de tentativas',
  comparison: 'Comparação de tentativas',
  'variability-comparison': 'Efeito da variabilidade',
  'fatigue-comparison': 'Efeito da fadiga',
};

/** Tempo de espera após a última mudança confirmada antes de salvar (§12: nunca a cada frame). */
const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * `restoreSessionFromStorage` só lê e valida — não muta nenhuma store — então
 * é seguro chamar dentro do inicializador preguiçoso do `useState` para
 * decidir a tela inicial sem passar por um efeito. Aplicar o resultado
 * (mutar `preparationStore`/`attemptsStore`) continua acontecendo no efeito
 * abaixo, protegido pelo `hasRestoredRef` contra a dupla invocação do Strict
 * Mode; chamar esta função de novo ali é redundante, mas barata — só JSON e
 * validação de schema, sem custo de repetir.
 */
function initialViewFromStorage(): View {
  return restoreSessionFromStorage().ok ? 'preparation' : 'setup';
}

export function TrailExperience() {
  const [view, setView] = useState<View>(initialViewFromStorage);
  const [attempt, setAttempt] = useState<AttemptConfig | null>(null);
  // Cada tentativa remonta o componente de execução, garantindo estado limpo.
  const [attemptCount, setAttemptCount] = useState(0);

  const historyCount = useAttemptsStore((state) => state.history.length);

  // Restaura a sessão salva uma única vez, ao montar. Strict Mode do React
  // pode invocar o efeito duas vezes em desenvolvimento; a ref garante que a
  // segunda invocação não sobrescreva o que a primeira já aplicou.
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const outcome = restoreSessionFromStorage();
    usePersistenceStatusStore.getState().setRestoreOutcome(outcome);

    if (outcome.ok) {
      applySessionPayload(outcome.payload);
    }

    // Se havia uma execução ativa quando a página fechou/recarregou, ela não
    // pôde ser retomada — avisar em vez de simplesmente reaparecer na
    // preparação sem explicação (§7.6).
    if (consumeInterruptedAttemptMarker()) {
      usePersistenceStatusStore.getState().setWasInterrupted(true);
    }
  }, []);

  // Salva após mudanças confirmadas na preparação e ao concluir uma execução
  // (§12). Ambas as stores só mudam por ações discretas do operador — nunca
  // por tick de física, que fica isolado numa ref — então reagir a QUALQUER
  // mudança aqui já satisfaz "nunca a cada frame" por construção.
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
    const unsubscribeAttempts = useAttemptsStore.subscribe(scheduleSave);

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      unsubscribePreparation();
      unsubscribeAttempts();
    };
  }, []);

  const start = (config: AttemptConfig) => {
    markAttemptActive();
    setAttempt(structuredClone(config));
    setAttemptCount((current) => current + 1);
    setView('running');
  };

  const backToPreparation = () => {
    clearActiveAttemptMarker();
    setAttempt(null);
    setView('preparation');
  };

  const goToPreparation = () => setView('preparation');
  const goToHistory = () => setView('history');
  const goToSetup = () => setView('setup');

  // Experimento "com e sem variabilidade" (evolução pedagógica, frente 2): a
  // condição "sem variabilidade" roda pelo mesmo `TrailRun`/`start` de
  // qualquer tentativa — reaproveita registro, salvamento e histórico sem
  // nenhum caminho novo. A comparação lê as duas pontas pelo `experimentOf`
  // já salvo no histórico, não por estado local — sobrevive a um
  // recarregamento de graça (`variabilityComparisonId` guarda só o id).
  const [variabilityComparisonId, setVariabilityComparisonId] = useState<string | null>(null);
  // Id da tentativa "sem variabilidade" recém-registrada — só existe depois
  // que `TrailRun` a grava; é o que o botão "Comparar efeito da
  // variabilidade" (dentro da própria execução) precisa para navegar.
  const [recordedVariabilityExperimentId, setRecordedVariabilityExperimentId] = useState<string | null>(null);

  const startVariabilityExperiment = (origin: AttemptResult) => {
    setRecordedVariabilityExperimentId(null);
    start(buildWithoutVariabilityConfig(origin));
  };

  // Mesmo padrão para o experimento "com e sem fadiga" (frente 5).
  const [fatigueComparisonId, setFatigueComparisonId] = useState<string | null>(null);
  const [recordedFatigueExperimentId, setRecordedFatigueExperimentId] = useState<string | null>(null);

  const startFatigueExperiment = (origin: AttemptResult) => {
    setRecordedFatigueExperimentId(null);
    start(buildWithFatigueConfig(origin));
  };

  const handleRecorded = (recorded: AttemptResult) => {
    if (recorded.config.experimentOf?.kind === 'variability') {
      setRecordedVariabilityExperimentId(recorded.id);
    }
    if (recorded.config.experimentOf?.kind === 'fatigue') {
      setRecordedFatigueExperimentId(recorded.id);
    }
  };

  const goToVariabilityComparison = (experimentalAttemptId: string) => {
    setVariabilityComparisonId(experimentalAttemptId);
    setView('variability-comparison');
  };

  const goToFatigueComparison = (experimentalAttemptId: string) => {
    setFatigueComparisonId(experimentalAttemptId);
    setView('fatigue-comparison');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Simulador da Trilha
          </p>
          <h1 className="text-2xl font-semibold">{VIEW_TITLES[view]}</h1>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {view !== 'setup' && view !== 'running' && view !== 'preparation' && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={goToPreparation}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              Preparação
            </button>
          )}
          {view !== 'setup' && view !== 'running' && historyCount > 0 && view !== 'history' && view !== 'comparison' && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={goToHistory}
            >
              <History className="size-4" aria-hidden="true" />
              Histórico ({historyCount})
            </button>
          )}
          {/* Exportar/importar ficam sempre acessíveis — inclusive durante uma
              execução — porque nenhuma delas descarta a tentativa em andamento:
              a importação só troca a preparação e o histórico, sempre com
              confirmação explícita antes de substituir qualquer coisa. */}
          {view !== 'setup' && <SessionMenu />}
          {/* Seletor de exercícios: leva à Fábrica de componentes, outro
              exercício independente no mesmo projeto — sessão e persistência
              próprias, sem afetar a rota nem o comportamento da trilha (TG12
              do guia da fábrica). */}
          <Link
            href="/fabrica"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Factory className="size-4" aria-hidden="true" />
            Fábrica de componentes
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
      {view !== 'running' && view !== 'setup' && <PendingAttemptBanner onViewHistory={goToHistory} />}

      {view === 'setup' && <ExpeditionSetup onDone={goToPreparation} />}

      {view === 'running' && attempt && (
        <TrailRun
          key={attemptCount}
          config={attempt}
          onBackToPreparation={backToPreparation}
          onViewHistory={goToHistory}
          onRecorded={handleRecorded}
          onCompareVariability={
            attempt.experimentOf?.kind === 'variability' && recordedVariabilityExperimentId
              ? () => goToVariabilityComparison(recordedVariabilityExperimentId)
              : undefined
          }
          onCompareFatigue={
            attempt.experimentOf?.kind === 'fatigue' && recordedFatigueExperimentId
              ? () => goToFatigueComparison(recordedFatigueExperimentId)
              : undefined
          }
        />
      )}

      {view === 'preparation' && (
        <Preparation onStart={start} onViewHistory={goToHistory} onNewExpedition={goToSetup} />
      )}

      {view === 'history' && (
        <HistoryPanel
          onCompare={() => setView('comparison')}
          onReused={goToPreparation}
          onStartVariabilityExperiment={startVariabilityExperiment}
          onViewVariabilityComparison={goToVariabilityComparison}
          onStartFatigueExperiment={startFatigueExperiment}
          onViewFatigueComparison={goToFatigueComparison}
        />
      )}

      {view === 'variability-comparison' && variabilityComparisonId && (
        <VariabilityComparisonPanel experimentalAttemptId={variabilityComparisonId} onBack={goToHistory} />
      )}

      {view === 'fatigue-comparison' && fatigueComparisonId && (
        <FatigueComparisonPanel experimentalAttemptId={fatigueComparisonId} onBack={goToHistory} />
      )}

      {view === 'comparison' && <ComparisonPanel onBack={goToHistory} />}
    </div>
  );
}
