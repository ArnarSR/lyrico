import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only. The e2e/ directory is Playwright's, run via `npm run test:e2e`.
    include: ['src/**/*.test.ts'],
  },
})
