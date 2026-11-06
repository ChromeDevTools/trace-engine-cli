# Agent Guide (`AGENTS.md`)

This guide is for AI coding assistants and autonomous agents working on the `trace-engine-cli` codebase.

---

## 1. Codebase Overview & Directory Structure

`trace-engine-cli` is a Node.js CLI tool written in TypeScript (ESM) that parses Chromium performance traces via Chrome DevTools' Trace Engine (`@paulirish/trace_engine`) and formats summaries using TOON (`@toon-format/toon`) and Markdown.

```
trace-engine-cli/
├── bin/
│   └── trace-engine-cli.ts       # Executable entry point shim
├── src/
│   ├── cli.ts                    # Yargs CLI definitions & command routing
│   ├── engine/
│   │   ├── adapter.ts            # Dynamic trace engine resolver & cache
│   │   ├── helpers.ts            # Shared thread discovery & insight extraction
│   │   ├── loader.ts             # Decompression, JSON normalization, parse dispatch
│   │   ├── types.ts              # Strongly typed output schemas & contracts
│   │   └── extractors/
│   │       ├── overview.ts       # Bounds, CWVs, main thread category breakdown
│   │       ├── insights.ts       # LCP, INP, CLS, render-blocking, 3rd party cards
│   │       ├── tasks.ts          # Long tasks, bottom-up & top-down call trees
│   │       ├── find.ts           # Function search, call count, and starvation queries
│   │       ├── profile.ts        # Time-bucketed CPU progression profiles
│   │       ├── diff.ts           # Differential CPU profiling between time windows
│   │       ├── scheduling.ts     # Async task/rAF lifecycle and churn detection
│   │       ├── network.ts        # Waterfall timings, render blocking, initiator chains
│   │       ├── interactions.ts   # Interaction to Next Paint latencies & targets
│   │       ├── shifts.ts         # Layout shift clusters, scores, culprit nodes
│   │       ├── events.ts         # Raw event filtering by name, category, phase, payload
│   │       ├── navigations.ts    # Navigation events and InsightSet mappings
│   │       └── scan.ts           # Multi-file and directory discovery & event filtering
│   ├── formatters/
│   │   ├── index.ts              # Format dispatcher & drill-down command hints
│   │   ├── toon.ts               # Tabular TOON serializer (@toon-format/toon)
│   │   └── markdown.ts           # GitHub Flavored Markdown serializer
│   └── utils/
│       ├── filter.ts             # Time-range parser & bounds intersection checks
│       └── units.ts              # Micro/milli conversions, rounding, byte formatting
├── scripts/
│   └── bundle-engine.ts          # esbuild script to bundle local devtools-frontend source
├── test/
│   ├── fixtures/                 # Synthetic trace fixtures (.json, .json.gz)
│   ├── extractors/               # Extractor unit tests
│   ├── formatters/               # Formatter unit tests
│   ├── utils/                    # Utility unit tests
│   ├── cli.test.ts               # End-to-end CLI integration tests
│   └── loader.test.ts            # Loader & decompression tests
├── biome.json                    # Biome lint and format configuration
├── tsconfig.json                 # TypeScript compiler configuration (NodeNext)
└── package.json                  # Package scripts and dependencies
```

---

## 2. Core Invariants & Engineering Principles

### 2.1. Time & Size Unit Conventions
- **Microsecond Invariant**: Chromium trace event timestamps (`ts`) and durations (`dur`) are emitted in integer microseconds ($\mu s$).
- **Millisecond Normalization**: All external CLI outputs, formatted tables, and interfaces in [`src/engine/types.ts`](src/engine/types.ts) MUST normalize time to milliseconds (`*Ms`) using [`microToMilli`](src/utils/units.ts).
- **Byte Sizes**: Transfer and resource sizes must be reported in bytes (`*Bytes`) or formatted via [`formatBytes`](src/utils/units.ts).

### 2.2. Relative vs. Absolute Timestamps
- **Relative Timeline by Default**: All user-facing time range arguments (`--time-range`, `--window-a`, `--window-b`, `--bucket`) must be interpreted relative to trace start (`bounds.minMs` = `0ms`).
- **Resolution**: Use [`resolveTimeRange`](src/utils/filter.ts) in [`src/cli.ts`](src/cli.ts) before passing ranges to extractors.
- **Unit Support**: Parse time values using [`parseTimeValue`](src/utils/filter.ts) to support `s`, `ms`, and `us`/`µs`.

### 2.3. Main Thread Category Calculation
- **No Flat Duration Summation**: Chromium traces contain deeply nested event slices (e.g. `RunTask` -> `EvaluateScript` -> `FunctionCall` -> `Layout`). Summing raw `entry.dur` across all entries results in severe double/triple counting (>100% trace time).
- **TraceTree Self-Times**: Main thread categories (Scripting, Layout, Rendering, GC, System, Idle) in [`src/engine/extractors/overview.ts`](src/engine/extractors/overview.ts) MUST be derived from non-overlapping `TraceTree.BottomUpRootNode` self-times so that `scripting + layout + rendering + gc + system + idle === totalDurationMs`.

### 2.4. Safe File Reading & No TOCTOU
- Do **not** use `fs.existsSync` immediately before `fs.readFileSync`.
- Read the file directly inside a `try/catch` and translate `ENOENT` to a clean user-facing error message (`Trace file not found: <path>`).

### 2.5. Trace Engine Dynamic Loading
- In [`src/engine/adapter.ts`](src/engine/adapter.ts), the engine resolution hierarchy is:
  1. `--trace-engine=<path>` (custom user bundle)
  2. `src/engine/vendor/trace_engine.js` (locally vendored bundle)
  3. `@paulirish/trace_engine` (npm package)
- The resolved module is cached in-memory to prevent repeated filesystem probes.

### 2.6. Process Log Safety
- Traces without full navigation lifecycles trigger non-fatal internal Lantern simulation errors (`LanternError: NO_LCP`) inside `@paulirish/trace_engine`.
- [`src/engine/loader.ts`](src/engine/loader.ts) selectively filters `LanternError` objects during `model.parse()` and restores `console.warn`/`console.error` immediately in a `finally` block. Never permanently mutate global logging functions.

### 2.7. No Ad-Hoc Probe Scripts
- Do not run ad-hoc command-line scripts (e.g. `node -e "..."` or scratch scripts) to probe data shapes, trace engine internals, or object structures.
- Determine data shapes by inspecting TypeScript definition files (`.d.ts`), source code types, and existing test fixtures directly.
- Verify behavior and assertions exclusively through the unit test suite (`npm test`).

### 2.8. Fast Scan Pre-Filtering & Absolute Timestamps
- The `scan` command does not invoke DevTools Trace Engine models or calculate relative trace bounds.
- Use substring pre-filtering on decompressed trace buffers before `JSON.parse` to avoid parsing non-matching files.
- `firstEventTsMs` in scan results reports raw absolute trace timestamps normalized to milliseconds, not offsets relative to trace start.

---

## 3. Adding New Extractors or Commands

When adding a new extractor:
1. **Define Types**: Add structured data interfaces to [`src/engine/types.ts`](src/engine/types.ts).
2. **Implement Extractor**: Create `src/engine/extractors/<feature>.ts`. Use [`getMainRendererThread`](src/engine/helpers.ts) or [`getPrimaryInsightSet`](src/engine/helpers.ts) for common data structures.
3. **Formatters**: Add Markdown rendering in [`src/formatters/markdown.ts`](src/formatters/markdown.ts) and dispatch handling in [`src/formatters/index.ts`](src/formatters/index.ts). (TOON handles arbitrary objects automatically).
4. **Register CLI Command**: Add the subcommand in [`src/cli.ts`](src/cli.ts).
5. **Add Tests**: Create `test/extractors/<feature>.test.ts` and add synthetic fixtures to `test/fixtures/` if needed.

---

## 4. Verification Workflow

Run these commands before completing any task:

```bash
# 1. Run full unit test suite (node:test)
npm test

# 2. Check code style and linting (Biome)
npm run check

# 3. Format files if needed
npm run format

# 4. Compile TypeScript (ensure dist/ is clean)
npm run build
```

---

## 5. Coding Standards Checklist

- [ ] **No `as any` bypasses**: Use explicit types, structural interfaces, or `ConstructorParameters<T>` / `Parameters<T>`.
- [ ] **No loops with assertions in tests**: Write explicit, unrolled assertions per case so failures pinpoint the exact property.
- [ ] **No defensive fallbacks that mask bugs**: Let invalid states throw clear errors rather than failing silently.
- [ ] **No ad-hoc probe scripts**: Verify types and behavior through static definitions and `npm test`.
- [ ] **Keep sentences short and direct in docs**: ASD-STE100 technical English.
