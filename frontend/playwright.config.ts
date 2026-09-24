import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// E2E tests run against an already-running app: E2E_BASE_URL (default: vite preview on :4173).
// In containers with a preinstalled Chromium, set PW_CHROMIUM_PATH (or it is auto-detected).
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  // CI runners have 2 cores; one browser at a time keeps WASM compilation and software WebGL from starving.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    launchOptions: executablePath ? { executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
