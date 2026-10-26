import { defineConfig } from "vitest/config";

/**
 * Nest resolves constructor dependencies through `design:paramtypes`, emitted only when TypeScript
 * runs with `experimentalDecorators` and `emitDecoratorMetadata`. Vitest compiles with esbuild by
 * default, which ignores those options; routing the build through the compiler API makes the tests
 * see the same metadata the real build emits.
 */
export default defineConfig({
  esbuild: false,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    pool: "threads",
    restoreMocks: true,
  },
});
