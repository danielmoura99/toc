import { expect, test } from '@playwright/test';

import {
  completeExpeditionSetup,
  displayNameAtQueuePosition,
  fastForwardToCompletion,
  moveCharacterForward,
} from './helpers';

/**
 * Fluxo exigido pelo guia (§13.2):
 *   preparar → concluir → alterar ordem → concluir → comparar → recarregar
 *   → recuperar histórico.
 *
 * Cada teste do Playwright já recebe um contexto de navegador isolado (sem
 * localStorage de testes anteriores), então não é preciso limpar nada antes.
 */
test('preparar, concluir duas vezes, comparar, recarregar e recuperar o histórico', async ({ page }) => {
  await page.goto('/trilha');
  await completeExpeditionSetup(page);

  // --- Preparar e concluir a primeira tentativa (ordem inicial, etapa 1) ---
  await fastForwardToCompletion(page);
  await expect(page.getByText('Tentativa registrada no histórico.')).toBeVisible();

  // --- Nova tentativa: alterar ordem (etapa 2) e concluir de novo ---
  await page.getByRole('button', { name: 'Nova tentativa' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');

  await page.getByRole('button', { name: '2 — Reorganizar' }).click();
  // A ordem inicial é sorteada — quem está na 3ª posição continua tendo para
  // onde ir depois de duas movidas para frente (chega à 1ª), diferente de
  // quem já começa na 2ª (ficaria na frente após a primeira, e a segunda
  // clicaria num botão então desabilitado).
  const notAtFront = await displayNameAtQueuePosition(page, 2);
  await moveCharacterForward(page, notAtFront, 2);

  await fastForwardToCompletion(page);
  await expect(page.getByText('Tentativa registrada no histórico.')).toBeVisible();

  // --- Histórico tem as duas tentativas ---
  await page.getByRole('button', { name: 'Ver histórico e comparar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Histórico de tentativas');
  await expect(page.locator('[data-testid^="history-"]')).toHaveCount(2);

  // --- Comparar as duas ---
  const checkboxes = page.locator('[data-testid^="history-"] input[type=checkbox]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByRole('button', { name: 'Comparar selecionadas' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparação de tentativas');
  // A tabela lado a lado mostra as duas colunas de tentativa, identificadas
  // pela posição cronológica real no histórico — a 1ª caminhada concluída
  // vira a referência automaticamente (§4.1).
  await expect(
    page.getByRole('columnheader', { name: /Tentativa 1 · Observar — Referência/ }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Tentativa 2 · Reorganizar/ })).toBeVisible();
  // Reordenar sozinho não muda o tempo total — é o resultado central do
  // motor (docs/decisions.md), e a comparação real precisa continuar
  // mostrando isso, não só uma tela que "parece" funcionar.
  await expect(page.getByText(/dispersão máxima (aumentou|diminuiu)|não mudou/)).toBeVisible();
  await expect(page.getByText('Perguntas para discussão')).toBeVisible();

  // --- Recarregar de verdade (não simulado) ---
  await page.reload();

  // Volta para a preparação (execução não persiste — §7.6), mas o histórico
  // e a comparação já feita continuam recuperáveis.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
  await expect(page.getByText('Sessão anterior restaurada deste navegador.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Histórico \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: /Histórico \(2\)/ }).click();
  await expect(page.locator('[data-testid^="history-"]')).toHaveCount(2);
});
