# Trace Engine CLI (`trace-cli`)

A fast, standalone, token-efficient command-line tool built on top of Chrome DevTools Trace Engine. It inspects Chromium performance traces (`.json` or `.json.gz`) and converts them into structured, high-signal summaries optimized for LLM context windows, AI coding agents, and developer performance diagnostics.

---

## Why `trace-cli`?

Raw Chromium performance traces are massive (often 20MB–200MB+ uncompressed), containing millions of low-level JSON events. Feeding raw traces directly to an LLM quickly exhausts token limits, incurs high costs, and drowns the model in noise.

`trace-cli` solves this by:
- **Token Compression**: Reduces trace context sizes by up to **95%+** through domain-specific extractors and tabular **TOON** (Token-Oriented Object Notation) serialization.
- **Chrome DevTools Trace Engine Integration**: Uses Chrome DevTools' battle-tested Trace Engine (`@paulirish/trace_engine`) to compute exact Core Web Vitals, task trees, and insight models.
- **Relative Timeline Model**: Defaults to elapsed time from trace start (`0ms`), matching the DevTools Performance panel timeline ruler and eliminating timestamp calculation errors.
- **Progressive Drill-Down**: Guides agents and humans from high-level summaries (`overview`) down into specific performance bottlenecks (`insights`, `tasks`, `find`, `profile`, `diff`, `scheduling`, `network`, `interactions`, `shifts`, `events`, `navigations`, `scan`).
- **Flexible Engine Resolution**: Uses `@paulirish/trace_engine` by default, or bundles single-file trace engine artifacts directly from local `devtools-frontend` checkouts.

---

## Installation

Install [`trace-engine-cli`](https://www.npmjs.com/package/trace-engine-cli) globally from npm to add `trace-cli` to your `$PATH`:

```bash
npm install -g trace-engine-cli
trace-cli /path/to/trace.json.gz
```

Or run it directly with `npx`:

```bash
npx trace-engine-cli /path/to/trace.json.gz
```

---

## Pointing AI Agents at `trace-cli`

To equip an AI assistant (or agent in your workspace) to analyze performance traces, add the following instruction to the agent's prompt or project rules:

> "To inspect Chromium performance traces (`.json` or `.json.gz`), run `trace-cli <file>`. Inspect the default overview, then use the suggested drill-down commands (`insights`, `tasks`, `find`, `profile`, `diff`, `scheduling`, `network`, `interactions`, `shifts`, `events`, `navigations`) for targeted diagnostics, or `scan <dir-or-glob>` to search across multiple fixtures."

Agents receive dense, token-efficient TOON tables that minimize prompt context consumption while providing structured metrics and actionable next steps.

---

## Quick Start

Invoking `trace-cli` with just a trace file path runs the `overview` command and prints recommended drill-down next steps:

```bash
# Default overview in TOON format (optimized for LLMs)
trace-cli trace.json.gz

# Overview in Markdown format (optimized for humans & GitHub)
trace-cli trace.json.gz --format md
```

### Global Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `-f, --format` | `'toon' \| 'md'` | `'toon'` | Output serialization format (`toon` or `md`) |
| `--time-range` | `string` | — | Filter window relative to trace start (e.g. `"3500,4200"`, `"3.5s,4.2s"`, `"100ms-500ms"`) |
| `--absolute-timestamps` | `boolean` | `false` | Treat time ranges as raw absolute trace timestamps rather than relative to trace start |
| `--trace-engine`| `string` | — | Path to a custom DevTools trace engine bundle |
| `--help` | `boolean` | — | Show help and synopsis |

---

## Relative vs. Absolute Timestamps & Units

All time-range inputs (`--time-range`, `--window-a`, `--window-b`, `--bucket`) support:
- **Relative timestamps by default**: `0` or `0ms` represents trace start (`bounds.minMs`). `3500` or `3.5s` represents `bounds.minMs + 3500ms`.
- **Unit suffixes**:
  - `s` (seconds): e.g. `3.5s`, `4.2s`
  - `ms` (milliseconds, default): e.g. `3500ms`, `500`
  - `us` / `µs` (microseconds): e.g. `3500000us`
- **Range formats**: Comma (`"3.5s,4.2s"`), colon (`"3.5s:4.2s"`), range dots (`"3500ms..4200ms"`), or hyphen (`"100ms-500ms"`).
- **Absolute mode**: Pass `--absolute-timestamps` to specify raw trace timestamps.

---

## Subcommands

### 1. `overview`
High-level trace metadata, Core Web Vitals (FCP, LCP, CLS, INP), non-overlapping main-thread category breakdown (Scripting, Layout, Rendering, GC, System, Idle), and diagnostic warnings.

```bash
trace-cli overview trace.json.gz
```

**Example TOON Output:**
```yaml
bounds:
  minMs: 122410994.89
  maxMs: 122416385.85
  durationMs: 5390.96
mainUrl: "https://web.dev/"
navigationStartMs: 122410996.89
coreWebVitals:
  fcp:
    valueMs: 129.21
    rating: good
  lcp:
    valueMs: 129.21
    rating: good
    url: "https://web-dev.imgix.net/image/example.svg"
  cls:
    value: 0
    rating: good
    worstClusterScore: null
  inp: null
mainThreadBreakdown:
  scriptingMs: 1.69
  layoutMs: 80.13
  renderingMs: 17.9
  gcMs: 0.07
  systemMs: 233.52
  idleMs: 5057.64
  totalMs: 5390.96
warnings[1]: 1 render-blocking resource(s) detected.
```

---

### 2. `insights`
Extracts actionable diagnostic insight cards generated by Chrome DevTools Insight models.

```bash
# All insights
trace-cli insights trace.json.gz

# Filter by diagnostic category
trace-cli insights trace.json.gz --category lcp
trace-cli insights trace.json.gz --category inp
trace-cli insights trace.json.gz --category cls
trace-cli insights trace.json.gz --category render-blocking
trace-cli insights trace.json.gz --category third-parties

# Target a specific navigation ID or InsightSet ID
trace-cli insights trace.json.gz --navigation NAVIGATION_0
trace-cli insights trace.json.gz --navigation 9E74B39B7C378297071F6E3618C4BC14
```

---

### 3. `tasks`
Main thread task execution, long tasks, and aggregated call trees.

```bash
# List long tasks above 50ms (default)
trace-cli tasks trace.json.gz

# Custom duration threshold and limit within relative window
trace-cli tasks trace.json.gz --min-duration 20 --time-range "1s,4s" --top 10

# Bottom-up call tree (aggregated and sorted by self-time)
trace-cli tasks trace.json.gz --tree bottom-up --top 20

# Top-down call tree (aggregated and sorted by total duration)
trace-cli tasks trace.json.gz --tree top-down --top 20
```

---

### 4. `find`
Search for executions of a specific function name or pattern to verify call frequency, duration, or confirm starvation (0 calls in window).

```bash
# Search for invocations of a function across the whole trace
trace-cli find trace.json.gz --function "drawEventTiles"

# Query within a specific relative time window
trace-cli find trace.json.gz --function "drawEventTiles" --time-range "3.5s,4.2s"
```

---

### 5. `profile`
Time-bucketed CPU profiling progression across discrete slices (e.g. 50ms buckets) to analyze temporal shifts in CPU consumption during gestures.

```bash
# Profile with automatic bucket sizing
trace-cli profile trace.json.gz --time-range "3.5s,4.1s"

# Specify 50ms bucket slices and top 5 functions per slice
trace-cli profile trace.json.gz --time-range "3500ms,4100ms" --bucket 50ms --top 5
```

---

### 6. `diff`
Differential CPU profiling comparing non-overlapping time windows in the trace (e.g. stalled gesture window vs healthy recovery window).

```bash
trace-cli diff trace.json.gz --window-a "3.55s,4.0s" --window-b "4.0s,4.45s" --top 10
```

---

### 7. `scheduling`
Inspects async task and animation frame scheduling lifecycle (`requestAnimationFrame`, `setTimeout`), detecting cancellation rates and rAF/timer thrashing.

```bash
# Async task metrics for the full trace
trace-cli scheduling trace.json.gz

# Narrow to a specific relative interaction window
trace-cli scheduling trace.json.gz --time-range "3.5s,4.1s"
```

---

### 8. `network`
Network request waterfall, priority, timings (Queueing, DNS, SSL, TTFB, Download), and request initiator chains.

```bash
# Top 20 slowest requests
trace-cli network trace.json.gz --slowest 20

# Filter render-blocking resources only
trace-cli network trace.json.gz --render-blocking

# Inspect the upstream initiator chain for a request (by requestId or URL)
trace-cli network trace.json.gz --initiator-chain "analytics.js"
```

---

### 9. `interactions`
Inspects user interaction latencies (Interaction to Next Paint - INP), broken down into input delay, processing duration, and presentation delay with target DOM node selectors.

```bash
trace-cli interactions trace.json.gz
```

---

### 10. `shifts`
Cumulative Layout Shift (CLS) session window clusters, cumulative scores, and culprit DOM elements causing visual instability. Pass `--events` to include individual shift event payloads, navigation IDs, and impacted DOM nodes.

```bash
# Cluster summary
trace-cli shifts trace.json.gz

# Include individual shift events and impacted node debug names
trace-cli shifts trace.json.gz --events
```

---

### 11. `events`
Inspect and filter raw trace events directly without custom parsing scripts. Supports filtering by event name, category, phase, time range, and projecting arbitrary nested payload fields via dot-notation:

```bash
# Match specific event names
trace-cli events trace.json.gz --name LayoutShift,navigationStart

# Extract specific dot-notation payload fields
trace-cli events trace.json.gz --name LayoutShift --fields args.data.navigationId,args.data.is_main_frame

# Filter by category and phase
trace-cli events trace.json.gz --cat devtools.timeline --phase X --top 20
```

---

### 12. `navigations` (alias: `navs`)
Inspect all navigations in the trace, their primary main frame status, and their mapped Chrome DevTools Trace Engine `InsightSet` IDs:

```bash
trace-cli navigations trace.json.gz
```

---

### 13. `scan`
Scan multiple trace files, directories, or glob patterns for specific events, categories, phases, raw text substrings, or payload property existence. Uses fast string pre-filtering before JSON parsing for rapid discovery across hundreds of test fixtures without loading heavy trace engine pipelines:

```bash
# Scan a directory for a specific event name
trace-cli scan front_end/panels/timeline/fixtures/traces/ --name LayoutShift

# Find which fixture contains a specific string in event payloads
trace-cli scan test/fixtures/ --grep "LayerTreeHostImpl:snapshot"

# Scan multiple glob patterns for composite categories
trace-cli scan "traces/*.json.gz" --cat devtools.timeline --top 10

# Find traces containing specific payload fields
trace-cli scan fixtures/ --name TracingStartedInBrowser --fields args.data.frames
```

---

## Output Formats

### TOON (Default)
[TOON (Token-Oriented Object Notation)](https://github.com/toon-format/toon) is a compact, uniform tabular format designed to maximize information density for LLMs. It avoids verbose JSON syntax delimiters while preserving structured typing.

### Markdown (`--format md`)
Generates standard GitHub Flavored Markdown (GFM) tables and summary headings, ideal for terminal viewing or pasting into PR descriptions.

---

## Bundling Local DevTools Trace Engine

To run `trace-cli` against the latest Chrome DevTools Trace Engine changes from a local `devtools-frontend` repository without needing Ninja:

```bash
DEVTOOLS_PATH=/path/to/devtools-frontend npm run bundle:engine
```

This compiles a zero-dependency bundle into `src/engine/vendor/trace_engine.js`. `trace-cli` will automatically detect and prioritize this local vendor file over the npm module.

---

## Development & Testing

```bash
# Install dependencies, build, and link locally
npm install
npm run build
npm link

# Run test suite (118+ unit tests via node:test)
npm test

# Run linter and type-checking (Biome & tsc)
npm run check

# Auto-format codebase
npm run format
```

---

## License

Apache-2.0

Eligibility for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security) is determined by the [Google Open Source Software Vulnerability Reward Program Rules](https://bughunters.google.com/about/rules/open-source/google-open-source-software-vulnerability-reward-program-rules).
