// Recursively widen every leaf from its literal type ("Save") to the
// plain `string` type so the matching sv/<name>.ts file can supply a
// different string while still satisfying the per-namespace catalog
// type. Shared by every en/<name>.ts so each namespace's type lives
// alongside the strings themselves.

export type Widen<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: Widen<T[K]> }
    : T;
