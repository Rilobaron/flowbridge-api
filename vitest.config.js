import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    pool: "forks",
    forks: {
      singleFork: true,
    },
    fileParallelism: false,
    isolate: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
