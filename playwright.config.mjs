import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'artifacts/browser/results',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/browser/report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 },
    baseURL: 'http://127.0.0.1:4193',
    trace: { mode: 'retain-on-failure', screenshots: false }, screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: { command: 'npm run preview', env: { PORT: '4193' }, url: 'http://127.0.0.1:4193/cad/', reuseExistingServer: false },
});
