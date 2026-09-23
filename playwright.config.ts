import { defineConfig, devices } from '@playwright/test'

const PORT = 5174
// Vite binds ::1, so address it as localhost rather than 127.0.0.1.
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // `--mode test` makes Vite load .env.test, pointing the app at the local
  // Supabase stack (supabase start) instead of production.
  webServer: {
    command: `npm run dev -- --mode test --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
