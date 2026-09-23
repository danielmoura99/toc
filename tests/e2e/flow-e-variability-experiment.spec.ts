import { expect, test } from '@playwright/test';

import { completeExpeditionSetup, fastForwardToCompletion, runReadyAttemptToCompletion } from './helpers';

/**
 * Fluxo exigido pela evolução pedagógica (§9): concluir caminhada → revelar
 * diagnóstico → criar experimento → concluir condição complementar →
 * comparar → recarregar → recuperar → iniciar tentativa normal com modo
 * padrão.
 */
test('diagnóstico, experimento de variabilidade e comparação sobrevivem a um recarregamento', async ({
  page,
}) => {
  // Três caminhadas completas nesta única sequência (original, condição
  // complementar, nova tentativa pós-recarregamento) — mais lento que o
  // padrão de 60 s do resto da suíte.
  test.setTimeout(150_000);

  await page.goto('/');
  await completeExpeditionSetup(page);

  // --- Diagnóstico recolhido antes de concluir a primeira caminhada ---
  await expect(page.getByText('Ver diagnóstico')).toBeVisible();
  await expect(page.getByText(/tem o menor ritmo de referência|Capacidades próximas/)).not.toBeVisible();
  await page.getByText('Ver diagnóstico').click();
  await expect(page.getByText(/tem o menor ritmo de referência|Capacidades próximas/)).toBeVisible();

  // --- Concluir a primeira caminhada ---
  await fastForwardToCompletion(page);
  await page.getByRole('button', { name: 'Nova tentativa' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');

  // Depois da 1ª conclusão, o diagnóstico já aparece aberto por padrão.
  await expect(page.getByText(/tem o menor ritmo de referência|Capacidades próximas/)).toBeVisible();

  // --- Criar o experimento a partir da tentativa concluída ---
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Histórico de tentativas');
  await page.getByRole('button', { name: /Comparar com e sem variabilidade/ }).click();

  // O experimento pula direto para a execução (não passa pela preparação).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caminhada do grupo');

  // --- Concluir a condição complementar ("sem variabilidade") ---
  await runReadyAttemptToCompletion(page);
  await expect(page.getByText('Tentativa registrada no histórico.')).toBeVisible();

  // --- Comparar o efeito da variabilidade ---
  await page.getByRole('button', { name: 'Comparar efeito da variabilidade' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Efeito da variabilidade');
  await expect(page.getByRole('columnheader', { name: /Diferença observada/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Com variabilidade' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sem variabilidade' })).toBeVisible();

  // --- Recarregar de verdade e recuperar ---
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa');
  await expect(page.getByText('Sessão anterior restaurada deste navegador.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Histórico \(2\)/ })).toBeVisible();

  // A comparação continua acessível pelo histórico depois de recarregar.
  await page.getByRole('button', { name: /Histórico/ }).click();
  await page.getByRole('button', { name: /Ver comparação de variabilidade/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Efeito da variabilidade');
  await expect(page.getByRole('columnheader', { name: /Diferença observada/ })).toBeVisible();

  // --- Nova tentativa normal usa o modo padrão, sem herdar "sem variabilidade" ---
  await page.getByRole('button', { name: 'Preparação' }).click();
  await fastForwardToCompletion(page);
  // Uma tentativa normal nunca oferece "comparar efeito da variabilidade" —
  // esse botão só aparece para a condição "sem variabilidade" de um experimento.
  await expect(page.getByRole('button', { name: 'Comparar efeito da variabilidade' })).toHaveCount(0);
});
