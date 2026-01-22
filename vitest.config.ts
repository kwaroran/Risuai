import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    svelte(),
  ],
  resolve: {
    alias: {
      src: '/src',
    },
    conditions: ['browser'],
  },
  test: {
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      exclude: ["node_modules/", "dist/", "src/**/*.{test,spec}.ts"]
    },
    environment: 'happy-dom',
    setupFiles: ['vitest.setup.ts'],
  },
})
