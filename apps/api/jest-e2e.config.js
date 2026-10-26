/**
 * The end-to-end suite runs compiled CommonJS, not through a bundler.
 *
 * Nest resolves constructor dependencies from `design:paramtypes`, metadata that only `tsc` emits.
 * A transform-based runner (esbuild/Vite/SWC) compiles TypeScript without it, which makes every
 * injected dependency arrive `undefined` — the suite then fails for a reason unrelated to the code.
 * Compiling first and running the output keeps exactly the metadata the production build has.
 *
 * Emit is redirected to `rootDir: .e2e-dist` so test artifacts never collide with `dist/`.
 */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/.e2e-dist/test/**/*.e2e.test.js"],
  moduleNameMapper: {
    "^@maia/contracts$": "<rootDir>/../../packages/contracts/dist/index.js",
  },
  setupFiles: ["<rootDir>/jest-e2e.setup.js"],
  testTimeout: 30000,
  verbose: false,
};
