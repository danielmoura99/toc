import { expect, test } from '@playwright/test';

import { completeExpeditionSetup } from './helpers';

/**
 * Fluxo exigido pelo guia (§13.2): pausa/continuação. Cobre junto a
 * confirmação de descarte de progresso (§7.6), já que ela só se aplica
 * justamente ao estado pausado.
 */
test('pausar, avançar, continuar — e confirmar antes de descartar o progresso', async ({ page }) => {
  await page.goto('/trilha');
  await completeExpeditionSetup(page);
  await page.getByRole('button', { name: /Iniciar caminhada/ }).click();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar' }).click();

  // Pausado: "Continuar" substitui "Iniciar", e "Avançar 30 s" fica disponível.
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
  const advanceButton = page.getByRole('button', { name: 'Avançar 30 s' });
  await expect(advanceButton).toBeEnabled();

  const clock = page.getByRole('group', { name: 'Relógio simulado', exact: true }).getByText(/^\d+:\d+$/);
  const clockBefore = await clock.innerText();
  await advanceButton.click();
  await expect
    .poll(async () => clock.innerText())
    .not.toBe(clockBefore);

  // --- Selecionar alguém na tabela mostra o painel de detalhes mesmo
  //     pausado — nenhum tick precisa rodar depois do clique (frente 3 da
  //     evolução pedagógica: o gráfico não pode ficar vazio ou com os dados
  //     de quem estava selecionado antes). ---
  const firstNameButton = page.locator('table button').first();
  const selectedName = await firstNameButton.innerText();
  await firstNameButton.click();
  const detailPanel = page.getByRole('region', { name: `Detalhes de ${selectedName}` });
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.getByText(/Chegou|Sem predecessor|Limitado pela fila|Espaço/)).toBeVisible();
  await expect(detailPanel.getByText('Ritmo de referência')).toBeVisible();
  // Clicar de novo desmarca (mesmo alternar do canvas).
  await firstNameButton.click();
  await expect(detailPanel).toHaveCount(0);

  // Tentar sair para a preparação com progresso pausado pede confirmação —
  // não descarta direto (§7.6).
  await page.getByRole('button', { name: 'Preparação' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Descartar o progresso desta tentativa?')).toBeVisible();

  // Cancelar mantém a tentativa exatamente onde estava.
  await page.getByRole('button', { name: 'Continuar tentativa' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caminhada do grupo');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();

  // Continuar a tentativa: volta a rodar.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar' }).click();

  // Desta vez, confirmar o descarte de fato volta para a preparação.
  await page.getByRole('button', { name: 'Preparação' }).click();
  await page.getByRole('button', { name: 'Descartar e voltar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');

  // A tentativa descartada não foi registrada no histórico.
  await expect(page.getByRole('button', { name: /Histórico/ })).toHaveCount(0);
});
