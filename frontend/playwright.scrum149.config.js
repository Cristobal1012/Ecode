import { defineConfig } from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'catalogo-real.spec.js',
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: process.env.QA149_RESULTS || '../.tmp/scrum149/browser.json' }]],
  outputDir: process.env.QA149_ARTIFACTS || '../.tmp/scrum149/browser-artifacts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
