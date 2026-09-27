import { expect, test } from '@playwright/test';

/**
 * Tela inicial (seletor de exercícios): dois botões para os exercícios e um
 * botão de "zerar histórico" que apaga os dados salvos dos dois de uma vez,
 * só depois de confirmação explícita.
 */
test('tela inicial: navega para os dois exercícios e zera o histórico dos dois com confirmação', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Qual exercício vamos rodar?');

  // --- Navega para a trilha e volta ---
  await page.getByRole('link', { name: 'Simulador da Trilha' }).click();
  await expect(page).toHaveURL(/\/trilha$/);
  await page.getByRole('link', { name: 'Início' }).click();
  await expect(page).toHaveURL(/\/$/);

  // --- Navega para a fábrica e volta ---
  await page.getByRole('link', { name: 'Fábrica de componentes' }).click();
  await expect(page).toHaveURL(/\/fabrica$/);
  await page.getByRole('link', { name: 'Início' }).click();
  await expect(page).toHaveURL(/\/$/);

  // --- Gera dado em cada exercício para depois confirmar que some ---
  await page.getByRole('link', { name: 'Fábrica de componentes' }).click();
  await page.getByRole('button', { name: 'Iniciar partida' }).click();
  await page.getByRole('button', { name: 'Processar próximo setor' }).click();
  await expect(page.getByText('Dia 1 de 10 · setor 2 de 5')).toBeVisible();

  // --- Zerar histórico, com confirmação ---
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Zerar histórico' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Isto apaga a preparação, o histórico')).toBeVisible();

  // Cancelar não apaga nada.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Fábrica de componentes' }).click();
  await expect(page.getByText('Dia 1 de 10 · setor 2 de 5')).toBeVisible();

  // Confirmar apaga e recarrega — a partida em andamento não existe mais.
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Zerar histórico' }).click();
  await page.getByRole('button', { name: 'Zerar tudo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Qual exercício vamos rodar?');

  await page.getByRole('link', { name: 'Fábrica de componentes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da partida');
});
