/**
 * Zera os dados salvos dos dois exercícios (trilha e fábrica) a partir da
 * tela inicial — a única tela que legitimamente conhece os dois módulos ao
 * mesmo tempo (cada exercício continua sem depender do outro).
 *
 * Além de limpar as chaves do localStorage, recarrega a página: os stores
 * Zustand de cada módulo são singletons de módulo JS, que sobrevivem a uma
 * navegação client-side entre rotas — só limpar o localStorage deixaria os
 * dados em memória de uma sessão já aberta reaparecerem (e serem regravados)
 * ao entrar de novo naquele exercício. Um reload garante que tudo — storage
 * e memória — volta ao estado inicial de uma vez, sem duplicar aqui o
 * conhecimento da forma interna de cada store.
 */

import { clearActiveAttemptMarker, clearStoredSession as clearTrailSession } from '@/features/trail/persistence/localStorageAdapter';
import { clearStoredSession as clearFactorySession } from '@/features/factory/persistence/localStorageAdapter';

export function resetAllData(): void {
  clearTrailSession();
  clearActiveAttemptMarker();
  clearFactorySession();
  window.location.reload();
}
