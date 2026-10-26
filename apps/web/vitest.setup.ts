import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not expose `afterEach` globally, so Testing Library cannot register its own
// automatic cleanup. Doing it here keeps every test independent.
afterEach(() => {
  cleanup();
});
