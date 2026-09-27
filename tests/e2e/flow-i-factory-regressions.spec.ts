import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, count = 5) {
  await page.goto('/fabrica');
  if (count !== 5) await page.getByRole('slider', { name: 'Quantidade de setores' }).fill(String(count));
  await page.getByRole('button', { name: 'Iniciar partida', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
}

test('fábrica: conclusão persistida imediatamente, sem depender do efeito ou debounce', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Completar dia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completar dia', exact: true })).toBeEnabled();
  const stored = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Completar dia')!;
    button.click();
    return JSON.parse(localStorage.getItem('factory-mvp:session:v1')!);
  });
  expect(stored.activeRun).toBeNull();
  expect(stored.history).toHaveLength(1);
  expect(stored.history[0].finalState.events).toHaveLength(50);
  await page.reload();
  await page.getByRole('button', { name: 'Histórico (1)', exact: true }).first().click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('fábrica: pendente permanece exportável e bloqueia repetições até abrir espaço', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Completar dia', exact: true }).click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('factory-mvp:session:v1')!);
    const result = saved.history[0];
    saved.history = Array.from({ length: 20 }, (_, i) => ({ ...result, id: `audit-${i}` }));
    localStorage.setItem('factory-mvp:session:v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Iniciar partida', exact: true }).click();
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Completar dia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repetir os mesmos sorteios' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Nova sequência de dados', exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('factory-mvp:session:v1')!));
  expect(saved.pendingRun.finalState.events).toHaveLength(50);
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir partida 1', exact: true }).click();
  const resolved = await page.evaluate(() => JSON.parse(localStorage.getItem('factory-mvp:session:v1')!));
  expect(resolved.pendingRun).toBeNull();
  expect(resolved.history.some((run: { id: string }) => run.id === saved.pendingRun.id)).toBe(true);
});

test('fábrica: 12 setores, observação parcial, registro e retorno sem descarte silencioso', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page, 12);
  await page.getByRole('button', { name: 'Processar próximo setor' }).click();
  await expect(page.getByText(/Dia parcial:/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Observação do fluxo' })).toBeVisible();
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Processar próximo setor' }).click();
  await expect.poll(() => page.getByRole('img', { name: /Linha de produção com/ }).evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  await page.getByText('Registro das jogadas (11)', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Registro turno a turno' }).locator('tbody tr')).toHaveCount(11);
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.getByRole('button', { name: 'Preparação', exact: true }).first().click();
  await page.getByRole('button', { name: 'Iniciar partida', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Retomar partida' }).click();
  await expect(page.getByText('Dia 1 de 10 · setor 12 de 12')).toBeVisible();
  await page.reload();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByText('Dia 1 de 10 · setor 12 de 12')).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: /Linha de produção com/ }).evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('fábrica: turno manual anima o dado e os lotes antes de liberar o próximo clique', async ({ page }) => {
  await start(page);
  const host = page.getByRole('img', { name: /Linha de produção com/ });
  const next = page.getByRole('button', { name: 'Processar próximo setor' });
  await next.click();
  await expect(host).toHaveAttribute('data-animating', 'true');
  await expect(next).toBeDisabled();
  await expect(page.getByText(/Dado sorteado/)).toBeVisible();
  await expect(host).toHaveAttribute('data-animating', 'false');
  await expect(next).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('factory-mvp:session:v1')!));
  expect(saved.activeRun.state.events).toHaveLength(1);
  // A terceira transferência percorre a curva entre a primeira e segunda linha.
  await next.click();
  await next.click();
  await expect(host).toHaveAttribute('data-animating', 'true');
  await expect(host).toHaveAttribute('data-animating', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await next.click();
  await expect(host).toHaveAttribute('data-animating', 'false');
  await expect(next).toBeEnabled();
});
