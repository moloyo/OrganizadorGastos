import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5175',
    channel: 'chrome',
    viewport: { width: 390, height: 900 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --mode e2e --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
