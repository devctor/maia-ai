import { defineConfig } from "vitest/config";

/**
 * Nest resolves constructor dependencies through `design:paramtypes` metadata, which only `tsc`
 * emits. The unit tests here are all pure functions and need no such metadata, so esbuild stays in
 * charge — but it must parse the decorators used by the modules under test.
 */
export default defineConfig({
  esbuild: {
    target: "es2022",
    tsconfigRaw: {
      compilerOptions: {
        target: "es2022",
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    pool: "threads",
    restoreMocks: true,
  },
});
