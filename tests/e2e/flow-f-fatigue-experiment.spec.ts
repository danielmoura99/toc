import { expect, test } from '@playwright/test';

import { completeExpeditionSetup, fastForwardToCompletion } from './helpers';

/**
 * Fluxo de fadiga exigido pela evolução pedagógica (§9): referência sem
 * fadiga → experimento ativo → energia observável e comparação → recarregar
 * → recuperar → nova tentativa com fadiga desligada.
 */
test('experimento de fadiga: energia observável, comparação e nova tentativa volta ao padrão desligado', async ({
  page,
}) => {
  // Duas caminhadas completas nesta sequência (referência + condição "com
  // fadiga") — mais lento que o padrão de 60 s do resto da suíte.
  test.setTimeout(150_000);

  await page.goto('/trilha');
  await completeExpeditionSetup(page);

  // --- Referência sem fadiga: primeira caminhada concluída ---
  await fastForwardToCompletion(page);
  await page.getByRole('button', { name: 'Nova tentativa' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');

  // O toggle de fadiga só aparece liberado depois da 1ª conclusão.
  const fatigueToggle = page.getByRole('checkbox', { name: /Ativar fadiga/ });
  await expect(fatigueToggle).toBeEnabled();
  await expect(fatigueToggle).not.toBeChecked();

  // --- Criar o experimento a partir da tentativa concluída ---
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Histórico de tentativas');
  await page.getByRole('button', { name: /Experimentar com fadiga/ }).click();

  // O experimento pula direto para a execução (não passa pela preparação).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caminhada do grupo');

  // --- Energia observável durante a execução ---
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Avançar 30 s' }).click();

  const firstNameButton = page.locator('table button').first();
  await firstNameButton.click();
  await expect(page.getByText('Reserva de energia (modelo)')).toBeVisible();
  await expect(page.getByText('Capacidade atual sem flutuação')).toBeVisible();
  await expect(page.getByText(/Provável restrição agora pela capacidade|Capacidades próximas agora|Todos chegaram/)).toBeVisible();

  // --- Concluir a condição "com fadiga" (já pausada, com alguns ticks
  //     avançados acima — continua avançando direto, sem passar por "Iniciar"
  //     de novo). ---
  const advance = page.getByRole('button', { name: 'Avançar 30 s' });
  const novaTentativa = page.getByRole('button', { name: 'Nova tentativa' });
  for (let i = 0; i < 200; i += 1) {
    if (await novaTentativa.isVisible()) break;
    await advance.click();
  }
  await expect(novaTentativa).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Tentativa registrada no histórico.')).toBeVisible();
  await expect(page.getByText('Energia e mudanças de candidata por fadiga (modelo)')).toBeVisible();

  // --- Comparar o efeito da fadiga ---
  await page.getByRole('button', { name: 'Comparar efeito da fadiga' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Efeito da fadiga');
  await expect(page.getByRole('columnheader', { name: /Efeito observado/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Com fadiga' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sem fadiga' })).toBeVisible();

  // --- Recarregar de verdade e recuperar ---
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
  await expect(page.getByText('Sessão anterior restaurada deste navegador.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Histórico \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: /Histórico/ }).click();
  await page.getByRole('button', { name: /Ver comparação de fadiga/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Efeito da fadiga');
  await expect(page.getByRole('columnheader', { name: /Efeito observado/ })).toBeVisible();

  // --- Nova tentativa normal usa o modo padrão: fadiga desligada ---
  await page.getByRole('button', { name: 'Preparação' }).click();
  await expect(page.getByRole('checkbox', { name: /Ativar fadiga/ })).not.toBeChecked();
});
