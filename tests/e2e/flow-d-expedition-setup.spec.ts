import { expect, test } from '@playwright/test';

import { completeExpeditionSetup, displayNameAtQueuePosition } from './helpers';

/**
 * Fluxo novo desta entrega: configuração de uma expedição sorteada, no lugar
 * da entrada direta num cenário fixo. Cobre os dois extremos do tamanho de
 * grupo aceito e a trava da etapa 1 (observar, sem editar nada), que é a
 * garantia central deste fluxo — a expedição sorteada não pode ser mexida
 * antes de ser observada.
 */
test('grupo de 4 pessoas (mínimo): gera a expedição travada na etapa 1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova expedição');

  await completeExpeditionSetup(page, { partySize: 4, names: ['Ana', 'Beto', 'Cátia', 'Davi'] });

  await expect(page.locator('[data-testid^="queue-"]')).toHaveCount(4);
  await expect(page.getByText('Etapa 1 — Observar')).toBeVisible();

  // Ordem sorteada: quem está na 2ª posição nunca está na frente, então seu
  // botão "para frente" reflete a trava de verdade (o de quem está na
  // frente fica sempre desabilitado, em qualquer etapa, por não ter para
  // onde ir).
  const notAtFront = await displayNameAtQueuePosition(page, 1);
  const moveForward = page.getByRole('button', { name: `Mover ${notAtFront} para frente` });

  // Etapa 1: nem a fila nem as mochilas podem ser mexidas.
  await expect(moveForward).toBeDisabled();
  await expect(page.getByText('A etapa 1 preserva as cargas iniciais.')).toBeVisible();

  // Avançar para a etapa 2 libera a fila, mas não as mochilas.
  await page.getByRole('button', { name: '2 — Reorganizar' }).click();
  await expect(moveForward).toBeEnabled();
  await expect(page.getByText('A etapa 2 preserva as cargas iniciais.')).toBeVisible();

  // "Nova expedição" volta ao assistente — sem carregar a preparação atual.
  await page.getByRole('button', { name: 'Nova expedição' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova expedição');
});

test('grupo de 12 pessoas (máximo): assistente completa e preparação mostra as 12', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page, { partySize: 12 });

  await expect(page.locator('[data-testid^="queue-"]')).toHaveCount(12);
  await expect(page.getByText('Etapa 1 — Observar')).toBeVisible();
});

test('reiniciar a primeira caminhada não sorteia outra expedição nem destrava edições', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page, { partySize: 5 });

  const queueBefore = await page.locator('[data-testid^="queue-"]').allTextContents();
  const notAtFront = await displayNameAtQueuePosition(page, 1);

  await page.getByRole('button', { name: /Iniciar caminhada/ }).click();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Preparação' }).click();
  await page.getByRole('button', { name: 'Descartar e voltar' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
  await expect(page.getByText('Etapa 1 — Observar')).toBeVisible();
  await expect(page.getByRole('button', { name: `Mover ${notAtFront} para frente` })).toBeDisabled();
  await expect(page.locator('[data-testid^="queue-"]')).toHaveText(queueBefore);
});
