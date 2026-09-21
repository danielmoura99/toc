/**
 * Ponte entre as stores (preparação, histórico) e a persistência (§12).
 *
 * É a única camada que decide QUANDO salvar, QUANDO restaurar e como aplicar
 * uma importação. `persistence/` não sabe que Zustand existe; `preparationStore`
 * e `attemptsStore` não sabem que localStorage existe. Este módulo é o que
 * conhece os dois lados.
 */

import { createAttemptConfig } from '../domain/attempt';
import { validateConfig } from '../domain/validation';
import type { AttemptResult } from '../domain/types';
import { getStage } from './stages';
import { useAttemptsStore } from './attemptsStore';
import { usePreparationStore } from './preparationStore';
import {
  buildSessionPayload,
  downloadSessionPayload,
  isLocalStorageAvailable,
  loadRawSession,
  preparationSnapshotFromDraft,
  saveRawSession,
  serializeSessionPayload,
  suggestedExportFileName,
  validateSessionPayload,
  type PreparationSnapshot,
  type SessionPayload,
} from '../persistence';
import type { SaveOutcome } from '../persistence/localStorageAdapter';

function sameOwnerByItem(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

/**
 * Valida a preparação salva contra o próprio cenário que ela carrega — física
 * (`validateConfig`) e permissões da etapa. Uma configuração pode ser
 * fisicamente válida (peso total correto, ninguém acima do limite) e mesmo
 * assim contrariar o que a etapa promete ao grupo: a etapa 1 é totalmente
 * travada, e a etapa 2 preserva as cargas iniciais. Isso não é coberto por
 * `validateConfig` — é regra da camada de aplicação (`application/stages.ts`),
 * não do domínio, então só é verificado aqui.
 *
 * Diferente da v1 do payload, o cenário não é mais procurado a partir da
 * etapa (`getStage(stage).scenarioId`) — vem embutido no próprio snapshot,
 * porque uma expedição gerada não tem um `scenarioId` fixo para procurar.
 */
function preparationSnapshotIssues(snapshot: PreparationSnapshot): string[] {
  try {
    const definition = getStage(snapshot.guidedStage);
    const scenario = snapshot.scenario;
    const reconstructed = createAttemptConfig(scenario, {
      seed: snapshot.seed,
      order: snapshot.order,
      ownerByItem: snapshot.ownerByItem,
      participantByCharacter: snapshot.participantByCharacter,
      hypothesis: snapshot.hypothesis,
      guidedStage: snapshot.guidedStage,
    });

    const result = validateConfig(reconstructed);
    const issues = result.valid ? [] : result.issues.map((issue) => `Preparação salva: ${issue.message}`);

    if (!definition.canRedistribute && !sameOwnerByItem(snapshot.ownerByItem, scenario.initialOwnerByItem)) {
      issues.push(
        `Preparação salva: a etapa ${snapshot.guidedStage} (${definition.title}) preserva as cargas ` +
          'iniciais, mas a mochila salva foi redistribuída.',
      );
    }

    if (!definition.canReorder && snapshot.order.join(',') !== scenario.initialOrder.join(',')) {
      issues.push(
        `Preparação salva: a etapa ${snapshot.guidedStage} (${definition.title}) não permite alterar ` +
          'a ordem, mas a ordem salva é diferente da inicial do cenário.',
      );
    }

    return issues;
  } catch (error) {
    return [`Preparação salva não pôde ser reconstruída: ${error instanceof Error ? error.message : String(error)}`];
  }
}

export type RestoreOutcome =
  | { ok: true; payload: SessionPayload }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'corrupted' | 'incompatible'; issues: string[] };

/**
 * Lê e valida a sessão salva, sem aplicá-la — quem chama decide se hidrata as
 * stores com o resultado. Nunca lança: toda falha é um valor de retorno.
 */
export function restoreSessionFromStorage(): RestoreOutcome {
  const loaded = loadRawSession();

  if (!loaded.ok) {
    if (loaded.reason === 'empty') return { ok: false, reason: 'empty' };
    return { ok: false, reason: 'unavailable' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reason: 'corrupted', issues: ['O conteúdo salvo não é um JSON válido.'] };
  }

  const validation = validateSessionPayload(parsedJson);
  if (!validation.ok || !validation.payload) {
    return { ok: false, reason: 'corrupted', issues: validation.issues };
  }

  const prepIssues = preparationSnapshotIssues(validation.payload.preparation);
  if (prepIssues.length > 0) {
    return { ok: false, reason: 'corrupted', issues: [...validation.issues, ...prepIssues] };
  }

  return { ok: true, payload: validation.payload };
}

/** Aplica um payload já validado às stores. Não valida de novo. */
export function applySessionPayload(payload: SessionPayload): void {
  usePreparationStore.getState().restoreDraft(payload.preparation);
  useAttemptsStore
    .getState()
    .hydrateHistory(payload.history, payload.referenceAttemptId, payload.pendingAttempt);
}

/** Monta o payload da sessão corrente a partir do estado atual das stores. */
export function currentSessionPayload(): SessionPayload {
  const { draft } = usePreparationStore.getState();
  const { history, referenceAttemptId, pendingAttempt } = useAttemptsStore.getState();
  return buildSessionPayload(draft, history, referenceAttemptId, pendingAttempt);
}

/**
 * Salva a sessão corrente. Chamado após mudanças confirmadas na preparação e
 * ao concluir uma execução — nunca a cada frame (§12).
 */
export function saveCurrentSession(): SaveOutcome {
  if (!isLocalStorageAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }

  return saveRawSession(serializeSessionPayload(currentSessionPayload()));
}

export function exportCurrentSession(): void {
  const payload = currentSessionPayload();
  downloadSessionPayload(payload, suggestedExportFileName(payload));
}

export interface ImportSummary {
  attemptCount: number;
  completedCount: number;
  timedOutCount: number;
  scenarioIds: string[];
  hasHypotheses: boolean;
  savedAt: string;
  hasPendingAttempt: boolean;
}

export type ValidateImportOutcome =
  | { ok: true; payload: SessionPayload; summary: ImportSummary }
  | { ok: false; issues: string[] };

/**
 * Valida um JSON importado e devolve um resumo para confirmação — não aplica
 * nada ainda. Aplicar é uma ação separada (`applySessionPayload`), disparada
 * só depois que o operador confirmar a substituição (§12).
 */
export function validateImportedRaw(raw: string): ValidateImportOutcome {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, issues: ['O arquivo não contém um JSON válido.'] };
  }

  const validation = validateSessionPayload(parsedJson);
  if (!validation.ok || !validation.payload) {
    return { ok: false, issues: validation.issues };
  }

  const prepIssues = preparationSnapshotIssues(validation.payload.preparation);
  if (prepIssues.length > 0) {
    return { ok: false, issues: [...validation.issues, ...prepIssues] };
  }

  const payload = validation.payload;
  const completedCount = payload.history.filter((attempt) => attempt.outcome === 'completed').length;

  return {
    ok: true,
    payload,
    summary: {
      attemptCount: payload.history.length,
      completedCount,
      timedOutCount: payload.history.length - completedCount,
      scenarioIds: [...new Set(payload.history.map((attempt) => attempt.config.scenario.id))],
      hasHypotheses: payload.history.some((attempt) => attempt.config.hypothesis.length > 0),
      savedAt: payload.savedAt,
      hasPendingAttempt: payload.pendingAttempt !== null,
    },
  };
}

export type ReuseAttemptOutcome = { ok: true } | { ok: false; issues: string[] };

/**
 * Carrega a ordem, as mochilas, os participantes e a hipótese de uma tentativa
 * do histórico de volta na preparação — o ponto de partida mais comum depois
 * de comparar resultados é repetir ou ajustar a última configuração, e sem
 * isto o único jeito era refazer manualmente cada arrasto e transferência.
 *
 * Reaproveita a mesma checagem de uma importação: a configuração gravada
 * precisa continuar válida (fisicamente e quanto às permissões da etapa)
 * contra o cenário como ele existe agora — uma revisão de cenário mudada
 * desde que a tentativa rodou é o único jeito disso falhar.
 */
export function reuseAttemptConfig(attempt: AttemptResult): ReuseAttemptOutcome {
  const snapshot = preparationSnapshotFromDraft(attempt.config);
  const issues = preparationSnapshotIssues(snapshot);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  usePreparationStore.getState().restoreDraft(snapshot);
  return { ok: true };
}
