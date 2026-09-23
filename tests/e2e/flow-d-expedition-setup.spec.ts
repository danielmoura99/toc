import { expect, test } from '@playwright/test';

import { completeExpeditionSetup, displayNameAtQueuePosition, fastForwardToCompletion } from './helpers';

/**
 * Fluxo novo desta entrega: configuração de uma expedição sorteada, no lugar
 * da entrada direta num cenário fixo. Cobre os dois extremos do tamanho de
 * grupo aceito, a trava da etapa 1 (observar, sem editar nada) e — desde o
 * ajuste de navegação de 22/09/2026 — a trava das etapas 2 e 3 até a primeira
 * caminhada desta expedição ser concluída (não só até ela ser gerada).
 */
test('grupo de 4 pessoas (mínimo): etapas 2 e 3 só liberam depois da primeira caminhada concluída', async ({
  page,
}) => {
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

  // Antes de concluir a primeira caminhada, as etapas 2 e 3 estão
  // inacessíveis — não basta ter gerado a expedição.
  const stage2Nav = page.getByRole('button', { name: '2 — Reorganizar' });
  const stage3Nav = page.getByRole('button', { name: '3 — Redistribuir' });
  await expect(stage2Nav).toBeDisabled();
  await expect(stage3Nav).toBeDisabled();
  await expect(page.getByText('Conclua a primeira caminhada para liberar as próximas etapas.')).toBeVisible();

  // Concluir a primeira caminhada (etapa 1) libera as próximas etapas.
  await fastForwardToCompletion(page);
  await page.getByRole('button', { name: 'Nova tentativa' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');

  await expect(stage2Nav).toBeEnabled();
  await expect(stage3Nav).toBeEnabled();
  await expect(
    page.getByText('Conclua a primeira caminhada para liberar as próximas etapas.'),
  ).not.toBeVisible();

  await stage2Nav.click();
  await expect(moveForward).toBeEnabled();
  await expect(page.getByText('A etapa 2 preserva as cargas iniciais.')).toBeVisible();

  // "Nova expedição" volta ao assistente — sem carregar a preparação atual.
  await page.getByRole('button', { name: 'Nova expedição' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova expedição');
});

test('grupo de 12 pessoas (máximo): assistente completa, preparação mostra as 12 e começa travada', async ({
  page,
}) => {
  await page.goto('/');
  await completeExpeditionSetup(page, { partySize: 12 });

  await expect(page.locator('[data-testid^="queue-"]')).toHaveCount(12);
  await expect(page.getByText('Etapa 1 — Observar')).toBeVisible();
  await expect(page.getByRole('button', { name: '2 — Reorganizar' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '3 — Redistribuir' })).toBeDisabled();
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
  // Abandonar sem concluir não libera as próximas etapas.
  await expect(page.getByRole('button', { name: '2 — Reorganizar' })).toBeDisabled();
});

test('a liberação das etapas 2 e 3 sobrevive a um recarregamento', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page, { partySize: 4 });

  await fastForwardToCompletion(page);
  await page.getByRole('button', { name: 'Nova tentativa' }).click();
  await expect(page.getByRole('button', { name: '2 — Reorganizar' })).toBeEnabled();

  await page.reload();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
  await expect(page.getByText('Sessão anterior restaurada deste navegador.')).toBeVisible();
  await expect(page.getByRole('button', { name: '2 — Reorganizar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '3 — Redistribuir' })).toBeEnabled();
});
