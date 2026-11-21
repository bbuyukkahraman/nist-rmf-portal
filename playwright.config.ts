import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.BASE_URL || 'https://nist-rmf-portal.axoss.workers.dev', headless: true },
  reporter: 'list',
});
