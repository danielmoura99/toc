import { expect, type Page } from '@playwright/test';

/**
 * Completa o assistente de nova expedição (tamanho do grupo → nomes →
 * sorteio) e aguarda a preparação carregar. A tela de configuração é o ponto
 * de entrada padrão de toda sessão nova — sem sessão salva no navegador,
 * `page.goto('/')` sempre chega aqui primeiro, então todo fluxo E2E precisa
 * passar por este assistente antes de interagir com a preparação.
 *
 * Os nomes são fictícios e não influenciam o sorteio (características são
 * sorteadas à parte) — servem só para preencher o formulário.
 */
export async function completeExpeditionSetup(
  page: Page,
  options: { partySize?: number; names?: string[] } = {},
): Promise<void> {
  const partySize = options.partySize ?? 6;
  const names = options.names ?? Array.from({ length: partySize }, (_, i) => `Participante ${i + 1}`);

  await page.getByRole('button', { name: String(partySize), exact: true }).click();

  for (let i = 0; i < partySize; i += 1) {
    await page.getByRole('textbox', { name: `Nome do participante ${i + 1}`, exact: true }).fill(names[i]);
  }

  await page.getByRole('button', { name: 'Gerar expedição' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparação da tentativa', { timeout: 15_000 });
}

/**
 * Inicia a tentativa corrente, pausa e avança 30 s repetidamente até a
 * conclusão. "Avançar 30 s" só fica disponível pausado (§7.6) — pausar
 * primeiro é necessário, não só uma escolha de velocidade.
 *
 * Usa o próprio motor, não um atalho: cada clique executa 30 ticks reais,
 * então isto exercita exatamente o mesmo caminho de código que reproduzir em
 * tempo real, só sem esperar o tempo real passar.
 */
export async function fastForwardToCompletion(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Iniciar caminhada/ }).click();
  // "Iniciar caminhada" (preparação) leva à tela de execução, ainda parada
  // ("ready"); "Iniciar" (execução) é quem de fato começa a rodar.
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();

  const advance = page.getByRole('button', { name: 'Avançar 30 s' });
  const novaTentativa = page.getByRole('button', { name: 'Nova tentativa' });

  for (let i = 0; i < 200; i += 1) {
    if (await novaTentativa.isVisible()) break;
    await advance.click();
  }

  await expect(novaTentativa).toBeVisible({ timeout: 15_000 });
}

/**
 * Nome de exibição de quem está numa posição da fila (0 = na frente). A
 * ordem inicial da expedição sorteada é embaralhada — nenhum personagem tem
 * posição garantida — então testes que precisam de alguém que NÃO esteja na
 * frente (o botão "para frente" de quem já está na frente fica sempre
 * desabilitado, em qualquer etapa) devem descobrir o nome pela posição real
 * no DOM, não supor um nome fixo.
 */
export async function displayNameAtQueuePosition(page: Page, position: number): Promise<string> {
  const item = page.locator('[data-testid^="queue-"]').nth(position);
  const text = await item.locator('p').first().innerText();
  return text.replace(/^\d+º\s*/, '').trim();
}

/** Move um personagem N posições para frente pelos botões de teclado (AC12). */
export async function moveCharacterForward(page: Page, displayName: string, times = 1): Promise<void> {
  const button = page.getByRole('button', { name: `Mover ${displayName} para frente` });
  for (let i = 0; i < times; i += 1) {
    await button.click();
  }
}
