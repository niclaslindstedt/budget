import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
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
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The eslint 10 + eslint-plugin-react-hooks 7 major bumps grew
      // their "recommended" presets with a wave of new lint opinions
      // (the React-Compiler-aware hook rules below, plus core
      // `no-useless-assignment`). They fire on deliberate, commented
      // patterns this codebase already relies on — `ref.current = x`
      // during render to keep a closure fresh, defensive `let x = init`
      // before a conditional reassign, controlled `setState` inside an
      // effect. Adopting any of them is a standalone refactor, not part
      // of a dependency bump, so the prior lint surface is preserved
      // here. Re-enable one at a time when the matching cleanup lands.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "no-useless-assignment": "off",
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
