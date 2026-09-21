import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração dos fluxos automatizados exigidos pelo guia (§13.2):
 *   preparar → concluir → alterar ordem → concluir → comparar → recarregar
 *   → recuperar histórico; e, à parte, pausa/continuação e importação
 *   inválida. Ver `tests/e2e/`.
 *
 * Sobe o próprio `next dev` para os testes; reaproveita um servidor já em
 * execução em desenvolvimento, para não competir pela porta.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
