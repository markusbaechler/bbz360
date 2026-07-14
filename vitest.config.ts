import { defineConfig } from 'vitest/config';

// Vitest = nur Unit-Tests. Playwright-E2E (tests/e2e/*.spec.ts) laeuft separat.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
