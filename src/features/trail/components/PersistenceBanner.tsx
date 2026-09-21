'use client';

/**
 * Avisos de persistência (§12, AC10): localStorage indisponível/cheio,
 * sessão restaurada com sucesso, ou sessão salva corrompida/incompatível.
 * Nunca aparece uma tela vazia por causa de um erro de armazenamento — o
 * aviso é explícito e a aplicação continua funcionando em memória.
 */

import { type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

import { usePersistenceStatusStore } from '../application/persistenceStatusStore';
import { clearStoredSession } from '../persistence/localStorageAdapter';

export function PersistenceBanner() {
  const localStorageAvailable = usePersistenceStatusStore((state) => state.localStorageAvailable);
  const restoreIssue = usePersistenceStatusStore((state) => state.restoreIssue);
  const restoredAt = usePersistenceStatusStore((state) => state.restoredAt);
  const saveIssue = usePersistenceStatusStore((state) => state.saveIssue);
  const wasInterrupted = usePersistenceStatusStore((state) => state.wasInterrupted);
  const dismissRestoreIssue = usePersistenceStatusStore((state) => state.dismissRestoreIssue);
  const dismissSaveIssue = usePersistenceStatusStore((state) => state.dismissSaveIssue);
  const dismissInterruption = usePersistenceStatusStore((state) => state.dismissInterruption);

  const banners: ReactNode[] = [];

  if (wasInterrupted) {
    banners.push(
      <Banner key="interrupted" tone="warning" onDismiss={dismissInterruption}>
        <p>
          Uma execução estava em andamento quando a página foi recarregada — ela não pôde ser
          retomada, e o resultado dela, se houver, não foi salvo. A preparação e o histórico de
          tentativas concluídas continuam intactos.
        </p>
      </Banner>,
    );
  }

  if (restoreIssue?.reason === 'corrupted') {
    banners.push(
      <Banner key="restore-corrupted" tone="warning" onDismiss={dismissRestoreIssue}>
        <p className="font-medium">A sessão salva neste navegador não pôde ser recuperada.</p>
        <ul className="mt-1 list-inside list-disc text-xs">
          {restoreIssue.issues?.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-xs font-medium underline"
            onClick={() => {
              clearStoredSession();
              dismissRestoreIssue();
            }}
          >
            Descartar sessão salva e começar do zero
          </button>
        </div>
      </Banner>,
    );
  }

  if (!localStorageAvailable) {
    banners.push(
      <Banner key="storage-unavailable" tone="warning">
        <p>
          O navegador não permite salvar dados agora (aba anônima, permissões, ou espaço esgotado).
          A sessão continua funcionando, mas <strong>o histórico não será preservado</strong> se a
          página fechar. Use &ldquo;Exportar&rdquo; para não perder o que já foi feito.
        </p>
      </Banner>,
    );
  } else if (saveIssue) {
    banners.push(
      <Banner key="save-issue" tone="warning" onDismiss={dismissSaveIssue}>
        <p>
          A última alteração não pôde ser salva
          {saveIssue.reason === 'quota_exceeded' ? ' — espaço de armazenamento esgotado' : ''}.
          Exporte a sessão como backup, se possível.
        </p>
      </Banner>,
    );
  }

  if (restoreIssue === null && localStorageAvailable && !saveIssue && restoredAt) {
    banners.push(
      <Banner key="restored" tone="info">
        <p>Sessão anterior restaurada deste navegador.</p>
      </Banner>,
    );
  }

  if (banners.length === 0) return null;

  return <div className="flex flex-col gap-2">{banners}</div>;
}

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: 'warning' | 'info';
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const Icon = tone === 'warning' ? AlertTriangle : tone === 'info' ? Info : CheckCircle2;
  const toneClasses =
    tone === 'warning'
      ? 'border-amber-400/50 bg-amber-50 text-amber-900'
      : 'border-sky-400/50 bg-sky-50 text-sky-900';

  return (
    <div role={tone === 'warning' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border p-3 text-sm ${toneClasses}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button type="button" className="shrink-0 text-xs font-medium underline" onClick={onDismiss}>
          Fechar
        </button>
      )}
    </div>
  );
}
