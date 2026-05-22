import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "playwright-report", "test-results"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // The native <select> renders the OS's own widget — wrong font on
      // every platform, iOS wheel picker on mobile — which breaks the
      // monospaced One Dark / One Light look. CLAUDE.md mandates custom
      // pickers; SelectPicker (src/components/form/SelectPicker.tsx)
      // is the drop-in replacement.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Native <select> is not allowed. Use <SelectPicker> from src/components/form instead.",
        },
      ],
    },
  },
  {
    // Playwright specs + config run under Node and use the
    // `@playwright/test` runtime — they're not part of the React
    // bundle, so the React-specific rules and browser-only globals
    // don't apply. Node globals (`process`) and the playwright
    // helpers (`expect`, `test`, `page`) come in via imports.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
