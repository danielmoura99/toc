import { expect, test } from '@playwright/test';

import { completeExpeditionSetup } from './helpers';

/**
 * Fluxo exigido pelo guia (§13.2): importação inválida. Cobre os dois jeitos
 * de um arquivo ser rejeitado — JSON malformado e versão de motor
 * incompatível — e confirma que, nos dois casos, a sessão em tela não muda e
 * nenhum diálogo de confirmação chega a aparecer.
 */
test('JSON malformado é rejeitado com mensagem clara, sem alterar a sessão', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page);

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'corrompido.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ isso não é um json válido'),
  });

  await expect(page.getByText('Não foi possível importar')).toBeVisible();
  await expect(page.getByText('A sessão atual não foi alterada.')).toBeVisible();
  // Nenhum resumo de importação chega a aparecer — a validação falha antes.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Continua na preparação, nada foi aplicado.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
});

test('versão de motor incompatível é rejeitada com mensagem específica', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page);

  // Exporta a sessão corrente só para ter um payload estruturalmente válido,
  // e adultera a versão do motor — o caminho real de "arquivo de uma versão
  // antiga da aplicação", não um JSON qualquer.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  payload.engineVersion = '0.0.1';

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'incompativel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });

  await expect(page.getByText('Não foi possível importar')).toBeVisible();
  await expect(page.getByText(/Versão do motor incompatível/)).toBeVisible();
  await expect(page.getByText(/0\.0\.1/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('arquivo maior que o limite de 2 MiB é rejeitado antes de tentar ler o conteúdo', async ({ page }) => {
  await page.goto('/');
  await completeExpeditionSetup(page);

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'grande-demais.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, '0'),
  });

  await expect(page.getByText('Não foi possível importar')).toBeVisible();
  await expect(page.getByText(/grande demais/i)).toBeVisible();
});
