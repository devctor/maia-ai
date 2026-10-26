import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.e2e-dist/**",
      "**/*.config.{js,mjs,cjs}",
      "**/jest-e2e.setup.js",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // The API runs on Node: `process`, `Buffer` and globals like `fetch` are legitimate there.
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
