import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

// Mirror the build-time `define` block in `vite.config.ts` so
// `src/utils/build-env.ts` can read these globals under vitest.
// Without these, the bare `__APP_VERSION__` references throw
// `ReferenceError: __APP_VERSION__ is not defined` at module load.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_PREVIEW__: JSON.stringify(false),
  },
  test: {
    include: ["tests/**/*_test.ts", "tests/**/*_tests.ts"],
  },
});
