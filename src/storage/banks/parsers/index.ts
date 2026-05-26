// Auto-register every parser module in this directory at import
// time. Each module side-effect-registers itself via
// `defineXlsxParser` / `defineCsvParser`, so dropping a new
// `<bank>.ts` here is the only step needed to add a new bank.
//
// `import.meta.glob` with `eager: true` resolves the matching
// modules at build time (no dynamic loading); Vite and Vitest both
// honour the same API. The glob excludes the file that contains the
// call — this `index.ts` itself isn't re-imported.

const modules = import.meta.glob("./*.ts", { eager: true });

// Referenced to suppress `noUnusedLocals` — the registrations are a
// side effect of the imports the glob resolves, not the binding.
void modules;
