---
name: find-optimizations
description: "Use when the user asks for high-value performance optimizations — order-of-magnitude wins in algorithms that matter, not micro-tuning. Surveys the hot paths (reducers, per-render passes, per-keystroke handlers, validators, synthesis pipelines, search indexes), presents candidates with complexity and trigger context for the user to gate the work, and is honest when the codebase has already been tuned and no high-value wins remain."
---

# Finding high-value optimizations

The job is **order-of-magnitude wins on algorithms that matter** —
not micro-optimization, not cleanup, not theoretical improvements
in cold paths. A successful run either lands a small number of
clear big-O improvements or reports honestly that the obvious wins
are already gone.

The skill is **survey-first**: present candidates to the user with
complexity and trigger context before doing work. The user gates
which ones land. Pure perf changes ship behind `no-changelog` —
they have no user-visible effect.

## When to invoke

- User says "find optimizations", "make this faster", "look for
  perf wins", "X feels slow".
- You opened a file and noticed an obvious hot-path quadratic loop
  with bounded inputs you could ship a fix for.

Do **not** run this proactively. It's an explicit user request — if
the codebase is already tuned, the right output is "nothing to do",
and that's only useful when the user asked.

## Honest framing first

Before any code search: **mature codebases often have no high-value
wins left**. The fast-loop check below tells you which kind of
codebase you're in — do it first, and tell the user honestly. A
"nothing to find" answer in 5 minutes is more valuable than a
fabricated 2x win in 2 hours.

## Triage in three passes

### Pass 1 — gauge how tuned the codebase already is (2 min)

Grep the data layer for evidence of prior optimization work:

```sh
grep -rln "WeakMap\|useMemo\|memoize" src/ | head -10
grep -rn "drops from O\|reduces O\|previously\|trades.*for one" src/ | head -10
grep -rn "single-pass\|single pass\|amortise\|amortis" src/ | head -10
```

If the comments are full of complexity claims ("trades two O(N log
N) sorts for one", "drops from O(E × R) to O((E + R) log R + E ×
band)", "K accounts × O(...) → O(R+T+H)"), the obvious wins are
gone. Tell the user upfront — don't promise three wins and then
backtrack.

Signals that the easy work has been done:

- `WeakMap` caches keyed on reducer-immutable inputs (rule regexes,
  sorted-transfer lookups)
- LRU / memoization caches on pure transforms
- "presortedRows" / "share-the-sort" parameter threading
- ref-equality dirty checks instead of byte/string compares
- slice-precheck guards on per-render predicate evaluators
- bucketed worst-case selection (e.g. one format call per tier
  instead of one per row)

When you see these, set expectations down before searching further.

### Pass 2 — survey hot paths (15-30 min)

The places where wins matter, ordered by impact:

1. **Per-keystroke paths** — the item reducer, cell-edit handlers,
   anything called from `onUpdateCell` / `onCommitCell`. A single
   slow function here is felt as input lag. Look at:
   - `src/data/reducers/item/index.ts` and its imports
   - The synthesis chain that runs before every render
     (`buildSynthesizedRows`, the rule cache, description
     normaliser)
   - Any function the reducer calls on every action regardless of
     type (e.g. `nextUncoveredDate` was called from `updateCell`
     for date columns — `coveredMonths` was rebuilt per keystroke)

2. **Per-render paths** — useMemo bodies that walk the whole budget
   tree, sort comparators that build template-literal strings,
   balance computations, search-index builds. The render is
   debounced by React but a slow useMemo blocks the commit.

3. **Per-load paths** — `validateUserData`, migrations,
   `parseUserData`. Cheap to run rarely but a slow validator is
   felt as a sluggish first paint, especially on a large file.

4. **Bulk-operation paths** — reconciliation matchers, conflict
   finders, import handlers. These run on user-triggered actions
   so a 10x speed-up shows up as a snappy modal vs a janky one.

5. **Search and indexing** — `buildSearchIndex`, `runSearch`. The
   index is rebuilt per `UserData` change; the search runs per
   keystroke against the index.

What to look for in each:

- **O(N × M) where M should be O(1)**: a `.find()` inside a loop
  over rows or entries. Convert to a Map. Easy to spot:
  `grep -rn "\.find(" src/data/ | grep -v findColumnByType`
- **O(N log N) where O(N) would do**: `.sort()[0]` (use a single
  pass for max), `.filter().sort().at(-1)` (use single-pass argmax).
- **O(R) rebuilt per keystroke**: a heavy function the reducer
  calls on every action. Either memoize, or guard with an early-
  return for the common case (partial input, no-op action, etc.).
- **Allocation churn in tight loops**: template-literal string
  keys (`${a}|${b}`) rebuilt N log N times inside a comparator;
  fresh objects per row when one shared object would do.
- **Early returns AFTER expensive work**: a guard that bails on a
  partial input placed below the precompute that produced data the
  guard then throws away. (This was the only real win this session
  — `nextUncoveredDate` did `coveredMonths(...)` then returned
  unchanged for partial dates.)

What to skip:

- **Bounded N**: column counts (≤8), sheet counts (single digits),
  active modal counts (1). A "fix" here changes nothing.
- **Already-memoized paths**: a useMemo with a tight dep array is
  already paying once-per-input. The work it does inside is rarely
  the bottleneck.
- **Debounced paths**: autosave serialisation runs once per few
  seconds. Even a 10x speed-up is invisible.
- **Heap-based top-K**: 2x at best for N ~ 10k, K = 50. Not
  order-of-magnitude.

### Pass 3 — verify each candidate (5 min per)

For each candidate that survives Pass 2:

1. **Find the call site(s)**. `grep -rn "<function>" src/`. If the
   function is only invoked from a debounced or one-shot path,
   demote the candidate.
2. **Estimate N in practice**. A 1000-row budget with 5 years of
   bank history (~1500 entries) is the realistic worst case for
   this project. If the optimization saves work only at N = 100k
   that won't happen, demote.
3. **Confirm the current complexity by reading the code**, not by
   trusting the comment. Code drifts; the optimization claim in a
   comment may have been undone by a later edit.
4. **Sanity-check that the fix is simple**. Order-of-magnitude
   wins from a 5-line change are real; "rewrite the synthesis
   pipeline to use a B-tree" is not in scope. Skip anything that
   requires architectural change.

## Presenting candidates

Show the user a ranked list **before writing any code**. For each
candidate, give:

- `file:line` of the issue
- Current complexity (e.g. O(N²))
- Proposed complexity (e.g. O(N))
- What triggers the code (per keystroke? per render? per import?)
- Realistic N
- One-sentence fix sketch

Also list the candidates you considered and rejected, with reasons.
This is how the user calibrates whether you actually looked or
just produced the most plausible-sounding wins. Be specific —
"considered the search top-K but it's 2x at best, not orders of
magnitude" is a useful rejection.

End the presentation by saying clearly whether you found 1, 2, 3,
or 0 candidates. **Don't pad the list.** A single real win is
better than three speculative ones; zero real wins is a valid
answer the user wants to hear.

## When the user approves the work

Standard fix loop:

1. **Make the minimum edit**. An order-of-magnitude win usually
   comes from a 1–5 line change (early-return reorder, Map
   substitution, `.find` → cached lookup). If the patch is larger
   than that, you may be over-reaching.
2. **Run the fast loop locally**: `make fmt-check && make lint &&
make typecheck && make test`. Tests are the safety net — a perf
   change that breaks behaviour is worse than no change.
3. **Run `make build`** and confirm clean.
4. **Commit with `perf(<scope>): <subject>`**. Mention what
   triggered the work and the complexity delta in the body.
5. **PR opens with `no-changelog`** — pure perf with no user-
   visible behaviour change. Run `write-changeset` to confirm.

If the fix changes any behaviour (different rounding, different
default, different fall-back), write a `Changed` or `Fixed`
fragment instead.

## Pitfalls

- **Believing the Explore agent's "everything is optimized"
  report** without spot-checking. The agent reads excerpts and can
  miss things past its read window. Always read the top 2–3
  candidate files yourself.
- **Counting 2x as a win**. Order-of-magnitude or skip. The user
  asked for high-value, not "any improvement".
- **Touching code with no measured cost**. Profile-blind
  optimization in a useMemo body that never showed up in a flame
  graph is wasted work. If the code looks slow but you can't show
  it being called frequently, demote.
- **Fabricating wins**. If pass 1 says the codebase is tuned,
  pass 2 surfaces only candidates you've already optimized
  away, and pass 3 demotes the rest, the answer is "nothing to
  do". Don't backfill the list with refactors-disguised-as-
  optimizations.
- **Sweeping into refactor territory**. "While I'm here, this
  function would read better as…" is a refactor, not a perf fix.
  File it under the refactor skill instead.
- **Over-caching at the cost of correctness or UX**. A cache that
  serves stale data after a user edit is worse than the slow
  function it replaced. If the optimization needs an invalidation
  contract you can't state in one sentence, skip it.

## Self-improvement

After a run, if you found a recurring pattern (a hot-path
function the codebase calls a lot but the survey doesn't yet
list), add it to "Pass 2 — survey hot paths" above. The skill is
the institutional memory of where to look — letting it stay
stale defeats the point.
