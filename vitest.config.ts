import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*_test.ts", "tests/**/*_tests.ts"],
  },
});
