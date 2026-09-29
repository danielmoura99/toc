import { expect, test, type Page } from '@playwright/test';

/**
 * Experiência "Restrição e melhoria do fluxo" (EVOLUCAO_FABRICA_RESTRICAO_E_FLUXO §11.10):
 * base → hipótese → diagnóstico → melhoria no não gargalo → melhoria na
 * restrição → comparação, com recarregamento no meio de uma tentativa.
 */

async function completeRemainingDays(page: Page, maxDays = 12) {
  const completeDay = page.getByRole('button', { name: 'Completar dia', exact: true });
  for (let i = 0; i < maxDays && (await completeDay.isVisible()); i += 1) {
    await expect(completeDay).toBeEnabled({ timeout: 15_000 });
    await completeDay.click();
  }
  await expect(page.getByText('Partida concluída.')).toBeVisible({ timeout: 15_000 });
}

async function startIntervention(page: Page, sector: RegExp, added: string, prediction: string) {
  await page.getByRole('radio', { name: sector }).check({ force: true });
  await page.getByRole('radio', { name: added, exact: true }).check({ force: true });
  await page.getByRole('textbox', { name: /Previsão e justificativa/ }).fill(prediction);
  await page.getByRole('button', { name: 'Executar tentativa desde o dia 1' }).click();
}

test('restrição e fluxo: hipótese, diagnóstico, duas melhorias com os mesmos sorteios, reload e comparação', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/fabrica');
  await page.getByRole('radio', { name: /Restrição e melhoria do fluxo/ }).check({ force: true });
  await expect(page.getByRole('heading', { name: 'Capacidades dos setores' })).toBeVisible();
  await page.getByRole('button', { name: '10 dias' }).click();
  await page.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(page.getByText(/Restrição e melhoria do fluxo · Linha de base/)).toBeVisible();

  // --- Linha de base ---
  await completeRemainingDays(page);

  // --- Hipótese antes do diagnóstico ---
  await expect(page.getByText('Qual setor você considera a restrição?')).toBeVisible();
  await expect(page.getByText(/Restrição por capacidade média/)).toHaveCount(0);
  await page.getByRole('radio', { name: /Pintura/ }).check({ force: true });
  await page.getByRole('textbox', { name: /Que evidências/ }).fill('Menor capacidade média na tabela');
  await page.getByRole('button', { name: 'Registrar hipótese e ver diagnóstico' }).click();

  // --- Diagnóstico ---
  await expect(page.getByText('Restrição por capacidade média: Pintura (3,5 lotes/dia)')).toBeVisible();
  await expect(page.locator('p', { hasText: 'Hipótese do grupo:' })).toContainText('Pintura');

  // --- Melhoria +1 num setor que não é restrição, com reload no meio ---
  await startIntervention(page, /Usinagem/, '+1 lote', 'Mais entrada, talvez mais estoque');
  await expect(page.getByText('+1 em Usinagem', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Dia 1 de 10 · setor 1 de 5')).toBeVisible();

  const completeDay = page.getByRole('button', { name: 'Completar dia', exact: true });
  for (let i = 0; i < 3; i += 1) {
    await expect(completeDay).toBeEnabled({ timeout: 15_000 });
    await completeDay.click();
  }
  await expect(page.getByText('Dia 4 de 10 · setor 1 de 5')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByText('Dia 4 de 10 · setor 1 de 5')).toBeVisible();
  await expect(page.getByText('+1 em Usinagem').first()).toBeVisible();

  await completeRemainingDays(page);
  await expect(page.getByRole('heading', { name: 'Antes e depois — +1 em Usinagem' })).toBeVisible();

  // --- Melhoria +1 na restrição original ---
  await startIntervention(page, /Pintura/, '+1 lote', 'Mais entrega');
  await expect(page.getByText('Dia 1 de 10 · setor 1 de 5')).toBeVisible();
  await completeRemainingDays(page);
  await expect(page.getByRole('heading', { name: 'Antes e depois — +1 em Pintura' })).toBeVisible();
  await expect(page.getByText('Restrição por capacidade média: Pintura (4,5 lotes/dia)')).toBeVisible();

  // --- Comparação: base + as duas tentativas, todas com os mesmos sorteios ---
  await page.getByRole('button', { name: 'Comparar linha de base e as duas últimas tentativas' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparação de partidas');
  await expect(page.getByText('Intervenção controlada — mesmos sorteios, só a capacidade mudou')).toHaveCount(2);
  await expect(page.getByRole('cell', { name: '+1 em Usinagem' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+1 em Pintura' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Linha de base' })).toBeVisible();

  expect(errors).toEqual([]);
});
