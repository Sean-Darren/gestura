import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{packages,integrations,tools}/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node'
  }
})
