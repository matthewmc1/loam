import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: tests don't need the PWA plugin,
// and the data layer runs in plain node against fake-indexeddb.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
