import { expect, test } from '@playwright/test';

/**
 * Fluxo completo da Fábrica de componentes, exigido pelo guia (§12): preparar
 * → jogar manualmente → completar rodada → automático → pausar → recarregar
 * → concluir → comparar com repetição → exportar/importar.
 */
test('fábrica: preparar, manual, rodada, automático, recarregar, concluir, comparar e exportar/importar', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto('/fabrica');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da partida');

  // --- Preparar ---
  await page.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linha de produção');
  await expect(page.getByText('Dia 1 de 10 · setor 1 de 5')).toBeVisible();

  // --- Jogar manualmente: exatamente um turno ---
  await page.getByRole('button', { name: 'Processar próximo setor' }).click();
  await expect(page.getByText('Dia 1 de 10 · setor 2 de 5')).toBeVisible();

  // --- Completar rodada ---
  await page.getByRole('button', { name: 'Completar dia' }).click();
  await expect(page.getByText('Dia 2 de 10 · setor 1 de 5')).toBeVisible();

  // --- Automático, depois pausar ---
  await page.getByRole('button', { name: 'Automático' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.waitForTimeout(1_500); // deixa alguns turnos automáticos acontecerem
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: 'Automático' })).toBeVisible();

  const progressBeforeReload = await page.locator('text=/^Dia \\d+ de 10 · setor \\d+ de 5$/').textContent();

  // --- Recarregar: recupera pausado, sem repetir o último turno (TG07) ---
  await page.reload();
  await expect(page.getByText('Sessão anterior da fábrica restaurada deste navegador.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linha de produção');
  await expect(page.getByText(progressBeforeReload!)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Automático' })).toBeVisible(); // pausado, não rodando

  // --- Concluir ---
  const completeDay = page.getByRole('button', { name: 'Completar dia' });
  for (let i = 0; i < 12 && (await completeDay.isVisible().catch(() => false)); i += 1) {
    await completeDay.click();
  }
  await expect(page.getByText('Partida concluída.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();

  // --- Comparar com repetição ---
  await page.getByRole('button', { name: 'Repetir os mesmos sorteios' }).click();
  await expect(page.getByText('Dia 1 de 10 · setor 1 de 5')).toBeVisible();
  const completeDay2 = page.getByRole('button', { name: 'Completar dia' });
  for (let i = 0; i < 12 && (await completeDay2.isVisible().catch(() => false)); i += 1) {
    await completeDay2.click();
  }
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();

  await page.getByRole('button', { name: 'Comparar com outra partida' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Histórico de partidas');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // Uma das duas partidas já vem pré-selecionada; marca a outra.
  const uncheckedBox = page.locator('tbody input[type=checkbox]:not(:checked)').first();
  await uncheckedBox.check();
  await page.getByRole('button', { name: /Comparar \(2\/3\)/ }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparação de partidas');
  // Mesma config e seed (repetição exata) — reconhecida como reprodução, não experimento independente.
  await expect(page.getByText('Reprodução — mesma configuração e seed')).toBeVisible();

  // --- Exportar / importar ---
  await page.getByRole('button', { name: 'Histórico' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(payload.history).toHaveLength(2);

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fabrica-sessao.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Substituir sessão' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
});
