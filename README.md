# Trace Engine CLI (`trace-engine-cli`)

A fast, standalone, token-efficient command-line tool built on top of Chrome DevTools Trace Engine. It inspects Chromium performance traces (`.json` or `.json.gz`) and converts them into structured, high-signal summaries optimized for LLM context windows, AI coding agents, and developer performance diagnostics.

---

## Why `trace-engine-cli`?

Raw Chromium performance traces are massive (often 20MB–200MB+ uncompressed), containing millions of low-level JSON events. Feeding raw traces directly to an LLM quickly exhausts token limits, incurs high costs, and drowns the model in noise.

`trace-engine-cli` solves this by:
- **Token Compression**: Reduces trace context sizes by up to **95%+** through domain-specific extractors and tabular **TOON** (Token-Oriented Object Notation) serialization.
- **Chrome DevTools Trace Engine Integration**: Uses Chrome DevTools' battle-tested Trace Engine (`@paulirish/trace_engine`) to compute exact Core Web Vitals, task trees, and insight models.
- **Relative Timeline Model**: Defaults to elapsed time from trace start (`0ms`), matching the DevTools Performance panel timeline ruler and eliminating timestamp calculation errors.
- **Progressive Drill-Down**: Guides agents and humans from high-level summaries (`overview`) down into specific performance bottlenecks (`insights`, `tasks`, `find`, `profile`, `diff`, `scheduling`, `network`, `interactions`, `shifts`, `events`, `navigations`, `scan`).
- **Flexible Engine Resolution**: Uses `@paulirish/trace_engine` by default, or bundles single-file trace engine artifacts directly from local `devtools-frontend` checkouts.

---

## Installation

Requires Node.js 22.17 or later.

Install [`trace-engine-cli`](https://www.npmjs.com/package/trace-engine-cli) globally from npm to add `trace-engine-cli` to your `$PATH`:

```bash
npm install -g trace-engine-cli
trace-engine-cli /path/to/trace.json.gz
```

Or run it directly with `npx`:

```bash
npx trace-engine-cli /path/to/trace.json.gz
```

---

## Using with AI Coding Agents

`trace-engine-cli` is designed for progressive self-discovery so AI coding agents can learn its capabilities at runtime without loading the entire manual into your system prompt.

### How Agents Discover Capabilities

1. **Default overview + built-in drill-down hints (`trace-engine-cli <file>`)**:
   Calling `trace-engine-cli <file>` with no subcommand runs `overview` and appends a `# Drill-down commands:` reference footer to the output. That first call gives the agent the trace bounds, Core Web Vitals, main-thread category breakdown, and the exact syntax for every follow-up subcommand.
2. **Top-level command discovery (`trace-engine-cli` or `trace-engine-cli --help`)**:
   Running `trace-engine-cli` with no arguments or passing `--help` prints all 13 subcommands (`overview`, `insights`, `tasks`, `find`, `profile`, `diff`, `scheduling`, `network`, `interactions`, `shifts`, `events`, `navigations`, `scan`) and global options.
3. **Subcommand flag discovery (`trace-engine-cli <subcommand> --help`)**:
   Running `--help` on any subcommand (for example, `trace-engine-cli insights --help` or `trace-engine-cli events --help`) prints the flags, choices, and defaults for that command.

### Option 1: Minimal `AGENTS.md` / `CLAUDE.md` Rule

Add this snippet to your project instruction file (`AGENTS.md`, `CLAUDE.md`, or `.cursorrules`) to stop your agent from writing ad-hoc JSON parsing scripts and direct it to `trace-engine-cli`:

```markdown
## Performance Trace Analysis (`.json`, `.json.gz`)

- Never parse or search trace files manually with `jq`, `python`, `node -e`, `zcat`, or shell loops. Use `trace-engine-cli`, which handles gzip decompression, DevTools Trace Engine parsing, and token-compact TOON formatting.
- Start any single-trace investigation by running `trace-engine-cli <file>`. Read the overview and the `# Drill-down commands:` footer appended to the output to choose follow-up commands.
- To search across multiple trace files or directories, run `trace-engine-cli scan <dir-or-glob> [options]`.
- Run `trace-engine-cli --help` or `trace-engine-cli <subcommand> --help` to inspect available subcommands and flags.
```

### Option 2: Agent Skill Template (`SKILL.md`)

If your agent environment supports on-demand skills (such as `.gemini/skills/chrome-trace-analysis/SKILL.md` or `.claude/skills/chrome-trace-analysis/SKILL.md`), expand the block below and copy the template:

<details>
<summary><strong>Click to view full <code>SKILL.md</code> template</strong></summary>

````markdown
---
name: chrome-trace-analysis
description: Inspect and query Chrome/DevTools performance trace files and test fixtures (.json, .json.gz) using trace-engine-cli. Use when analyzing trace events, insights, or fixtures.
---

# Chrome & Chromium DevTools Trace Analysis

Use `trace-engine-cli` to inspect, profile, and diagnose performance recordings captured by the Chrome/Chromium DevTools Performance panel (`.json`, `.json.gz`).

---

## 1. Operational Constraints

- **Never parse or search traces manually**: Do not write ad-hoc `node -e`, `python`, `jq`, `zcat`, `gzcat`, `zgrep`, `zless`, or shell loops to inspect or search trace files or fixtures. `trace-engine-cli` handles gzip decompression, multi-file scanning, trace engine parsing, model traversal, and formatting.
- **Check command help proactively**: Run `trace-engine-cli --help` or `trace-engine-cli <subcommand> --help` to view available commands, flags (`--time-range`, `--category`, `--function`, `--top`), and output options before attempting custom workarounds.

---

## 2. Core Principles

- **Relative by default**: Time ranges (`--time-range`, `--window-a`, `--window-b`) default to relative time from trace start (`0ms` origin), matching the DevTools Performance panel UI.
- **Time units**: Range arguments accept milliseconds or explicit unit suffixes (`3500,4200`, `3.5s,4.2s`, `100ms,500ms`).
- **Absolute timestamps**: Pass `--absolute-timestamps` when querying raw epoch timestamps.
- **Output format**: Use `--format toon` (compact YAML-like output, default) for token efficiency, or `--format md` when generating Markdown tables for reports.

---

## 3. Command Reference

### `trace-engine-cli <file>` / `trace-engine-cli overview <file>`
High-level trace metadata, duration, Core Web Vitals (LCP, INP, CLS), and main-thread category breakdown (Scripting, Layout, Rendering, GC, System, Idle). Calling `trace-engine-cli <file>` without `overview` also prints the `# Drill-down commands:` reference footer.
```bash
trace-engine-cli trace.json.gz
```

### `trace-engine-cli insights <file>`
Diagnostic insight cards for Core Web Vitals and performance bottlenecks.
```bash
trace-engine-cli insights trace.json.gz

# Filter by diagnostic category: lcp, inp, cls, render-blocking, third-parties
trace-engine-cli insights trace.json.gz --category cls

# Target a specific navigation ID or InsightSet ID
trace-engine-cli insights trace.json.gz --navigation NAVIGATION_0
```

### `trace-engine-cli shifts <file>`
Layout shift clusters, scores, and culprit DOM elements.
```bash
# Cluster summary
trace-engine-cli shifts trace.json.gz

# Include individual shift events, navigation IDs, and impacted DOM nodes
trace-engine-cli shifts trace.json.gz --events
```

### `trace-engine-cli events <file>`
Inspect and filter raw trace events by name, category, phase, time range, or extract payload fields via dot notation.
```bash
# Match specific event names
trace-engine-cli events trace.json.gz --name LayoutShift,navigationStart

# Extract nested payload fields via dot notation
trace-engine-cli events trace.json.gz --name LayoutShift --fields args.data.navigationId,args.data.score

# Filter by category and phase
trace-engine-cli events trace.json.gz --cat devtools.timeline --phase X --top 20
```

### `trace-engine-cli navigations <file>` (alias: `navs`)
List all navigations in the trace, their primary main frame status, and their mapped Chrome DevTools Trace Engine `InsightSet` IDs.
```bash
trace-engine-cli navigations trace.json.gz
```

### `trace-engine-cli profile <file>`
Time-bucketed CPU profiling progression across discrete intervals.
```bash
trace-engine-cli profile trace.json.gz --time-range "3500,4200" --top 3
trace-engine-cli profile trace.json.gz --time-range "3s,5s" --bucket 50ms
```

### `trace-engine-cli find <file>`
Search for function execution instances, call frequency, and execution times.
```bash
trace-engine-cli find trace.json.gz --function "drawEventTiles" --time-range "3000,5000"
```

### `trace-engine-cli tasks <file>`
Inspect long tasks (>50ms) with bottom-up and top-down TraceTree call aggregations.
```bash
trace-engine-cli tasks trace.json.gz --time-range "0,5000"
trace-engine-cli tasks trace.json.gz --tree bottom-up --top 20
```

### `trace-engine-cli interactions <file>`
List user interaction events, duration, processing delays, presentation delays, and target DOM elements.
```bash
trace-engine-cli interactions trace.json.gz
```

### `trace-engine-cli scheduling <file>`
Detect `requestAnimationFrame` and `setTimeout` scheduling, cancellations, and churn loops.
```bash
trace-engine-cli scheduling trace.json.gz --time-range "3500,4200"
```

### `trace-engine-cli network <file>`
Network request waterfall, timings, and initiator chains.
```bash
trace-engine-cli network trace.json.gz --slowest 10
trace-engine-cli network trace.json.gz --render-blocking
trace-engine-cli network trace.json.gz --initiator-chain "example.com"
```

### `trace-engine-cli diff <file>`
Differential CPU profile comparing two time windows.
```bash
trace-engine-cli diff trace.json.gz --window-a "3500,4000" --window-b "4000,4200" --top 10
```

### `trace-engine-cli scan <target>`
Scan a directory of trace files, a glob pattern, or multiple fixtures for matching events, categories, phases, or raw text patterns without loading heavyweight engine pipelines.
```bash
# Scan a directory to find which fixture contains an event
trace-engine-cli scan front_end/panels/timeline/fixtures/traces/ --name "LayerTreeHostImpl:snapshot"

# Fast substring search across compressed traces
trace-engine-cli scan "fixtures/**/*.json.gz" --grep "LayerTreeHostImpl"

# Filter by category and phase across multiple files
trace-engine-cli scan fixtures/traces/ --cat devtools.timeline --phase X
```

---

## 4. Diagnostic Investigation Recipes

### Recipe A: Investigating UI Jank / Interaction Stalls
1. **Check scheduling churn**: `trace-engine-cli scheduling <file> --time-range "<start>,<end>"`
2. **Bucket CPU activity**: `trace-engine-cli profile <file> --time-range "<start>,<end>"`
3. **Check for starved functions**: `trace-engine-cli find <file> --function "<name>" --time-range "<start>,<end>"`
4. **Diff against unblocked interval**: `trace-engine-cli diff <file> --window-a "<stallWindow>" --window-b "<unblockedWindow>"`

### Recipe B: Diagnosing Core Web Vitals (INP / LCP / CLS)
1. Run `trace-engine-cli <file>` to inspect CWV scores.
2. If INP is poor, run `trace-engine-cli interactions <file>`.
3. If CLS is high, run `trace-engine-cli shifts <file> --events` and `trace-engine-cli insights <file> --category cls`.
4. Run `trace-engine-cli insights <file>` for all diagnostic insight cards.

### Recipe C: Inspecting Test Fixtures (e.g. `fixtures/traces/`)
1. Check high-level trace contents: `trace-engine-cli <fixture>`
2. Inspect navigations and insight set IDs: `trace-engine-cli navigations <fixture>`
3. Inspect relevant subsystem: `trace-engine-cli shifts <fixture> --events`, `trace-engine-cli network <fixture>`, or `trace-engine-cli insights <fixture> --category <category>`
4. Inspect raw event payloads: `trace-engine-cli events <fixture> --name <EventName> --fields <fieldPaths>`
````

</details>

---

## Quick Start

Invoking `trace-engine-cli` with a trace file path runs the `overview` command and appends the `# Drill-down commands:` reference footer:

```bash
# Default overview + drill-down hints in TOON format (optimized for LLMs)
trace-engine-cli trace.json.gz

# Overview in Markdown format (optimized for humans & GitHub)
trace-engine-cli trace.json.gz --format md

# Show all available subcommands and global flags
trace-engine-cli --help
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

### 1. `overview` (default)
High-level trace metadata, Core Web Vitals (FCP, LCP, CLS, INP), non-overlapping main-thread category breakdown (Scripting, Layout, Rendering, GC, System, Idle), and diagnostic warnings.

```bash
# Default invocation (includes the drill-down commands footer)
trace-engine-cli trace.json.gz

# Explicit subcommand (omits the drill-down commands footer)
trace-engine-cli overview trace.json.gz
```

**Example TOON Output (`trace-engine-cli trace.json.gz`):**
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

# Drill-down commands:
# - trace-engine-cli insights <file> [--category <lcp|inp|cls|render-blocking|third-parties>] [--navigation <id>]
# - trace-engine-cli tasks <file> [--min-duration <ms>] [--tree <bottom-up|top-down>] [--top <n>]
# - trace-engine-cli find <file> --function <name> [--time-range <start,end>]
# - trace-engine-cli profile <file> [--time-range <start,end>] [--bucket <ms>]
# - trace-engine-cli diff <file> --window-a <start,end> --window-b <start,end>
# - trace-engine-cli scheduling <file> [--time-range <start,end>]
# - trace-engine-cli network <file> [--render-blocking] [--slowest <n>] [--initiator-chain <url>]
# - trace-engine-cli interactions <file>
# - trace-engine-cli shifts <file> [--events]
# - trace-engine-cli events <file> [--name <names>] [--cat <category>] [--fields <fields>]
# - trace-engine-cli navigations <file>
#
# Multi-file search:
# - trace-engine-cli scan <dir-or-glob> [--name <names>] [--cat <category>] [--grep <pattern>]
```

---

### 2. `insights`
Extracts actionable diagnostic insight cards generated by Chrome DevTools Insight models.

```bash
# All insights
trace-engine-cli insights trace.json.gz

# Filter by diagnostic category
trace-engine-cli insights trace.json.gz --category lcp
trace-engine-cli insights trace.json.gz --category inp
trace-engine-cli insights trace.json.gz --category cls
trace-engine-cli insights trace.json.gz --category render-blocking
trace-engine-cli insights trace.json.gz --category third-parties

# Target a specific navigation ID or InsightSet ID
trace-engine-cli insights trace.json.gz --navigation NAVIGATION_0
trace-engine-cli insights trace.json.gz --navigation 9E74B39B7C378297071F6E3618C4BC14
```

---

### 3. `tasks`
Main thread task execution, long tasks, and aggregated call trees.

```bash
# List long tasks above 50ms (default)
trace-engine-cli tasks trace.json.gz

# Custom duration threshold and limit within relative window
trace-engine-cli tasks trace.json.gz --min-duration 20 --time-range "1s,4s" --top 10

# Bottom-up call tree (aggregated and sorted by self-time)
trace-engine-cli tasks trace.json.gz --tree bottom-up --top 20

# Top-down call tree (aggregated and sorted by total duration)
trace-engine-cli tasks trace.json.gz --tree top-down --top 20
```

---

### 4. `find`
Search for executions of a specific function name or pattern to verify call frequency, duration, or confirm starvation (0 calls in window).

```bash
# Search for invocations of a function across the whole trace
trace-engine-cli find trace.json.gz --function "drawEventTiles"

# Query within a specific relative time window
trace-engine-cli find trace.json.gz --function "drawEventTiles" --time-range "3.5s,4.2s"
```

---

### 5. `profile`
Time-bucketed CPU profiling progression across discrete slices (e.g. 50ms buckets) to analyze temporal shifts in CPU consumption during gestures.

```bash
# Profile with automatic bucket sizing
trace-engine-cli profile trace.json.gz --time-range "3.5s,4.1s"

# Specify 50ms bucket slices and top 5 functions per slice
trace-engine-cli profile trace.json.gz --time-range "3500ms,4100ms" --bucket 50ms --top 5
```

---

### 6. `diff`
Differential CPU profiling comparing non-overlapping time windows in the trace (e.g. stalled gesture window vs healthy recovery window).

```bash
trace-engine-cli diff trace.json.gz --window-a "3.55s,4.0s" --window-b "4.0s,4.45s" --top 10
```

---

### 7. `scheduling`
Inspects async task and animation frame scheduling lifecycle (`requestAnimationFrame`, `setTimeout`), detecting cancellation rates and rAF/timer thrashing.

```bash
# Async task metrics for the full trace
trace-engine-cli scheduling trace.json.gz

# Narrow to a specific relative interaction window
trace-engine-cli scheduling trace.json.gz --time-range "3.5s,4.1s"
```

---

### 8. `network`
Network request waterfall, priority, timings (Queueing, DNS, SSL, TTFB, Download), and request initiator chains.

```bash
# Top 20 slowest requests
trace-engine-cli network trace.json.gz --slowest 20

# Filter render-blocking resources only
trace-engine-cli network trace.json.gz --render-blocking

# Inspect the upstream initiator chain for a request (by requestId or URL)
trace-engine-cli network trace.json.gz --initiator-chain "analytics.js"
```

---

### 9. `interactions`
Inspects user interaction latencies (Interaction to Next Paint - INP), broken down into input delay, processing duration, and presentation delay with target DOM node selectors.

```bash
trace-engine-cli interactions trace.json.gz
```

---

### 10. `shifts`
Cumulative Layout Shift (CLS) session window clusters, cumulative scores, and culprit DOM elements causing visual instability. Pass `--events` to include individual shift event payloads, navigation IDs, and impacted DOM nodes.

```bash
# Cluster summary
trace-engine-cli shifts trace.json.gz

# Include individual shift events and impacted node debug names
trace-engine-cli shifts trace.json.gz --events
```

---

### 11. `events`
Inspect and filter raw trace events directly without custom parsing scripts. Supports filtering by event name, category, phase, time range, and projecting arbitrary nested payload fields via dot-notation:

```bash
# Match specific event names
trace-engine-cli events trace.json.gz --name LayoutShift,navigationStart

# Extract specific dot-notation payload fields
trace-engine-cli events trace.json.gz --name LayoutShift --fields args.data.navigationId,args.data.is_main_frame

# Filter by category and phase
trace-engine-cli events trace.json.gz --cat devtools.timeline --phase X --top 20
```

---

### 12. `navigations` (alias: `navs`)
Inspect all navigations in the trace, their primary main frame status, and their mapped Chrome DevTools Trace Engine `InsightSet` IDs:

```bash
trace-engine-cli navigations trace.json.gz
```

---

### 13. `scan`
Scan multiple trace files, directories, or glob patterns for specific events, categories, phases, raw text substrings, or payload property existence. Uses fast string pre-filtering before JSON parsing for rapid discovery across hundreds of test fixtures without loading heavy trace engine pipelines:

```bash
# Scan a directory for a specific event name
trace-engine-cli scan front_end/panels/timeline/fixtures/traces/ --name LayoutShift

# Find which fixture contains a specific string in event payloads
trace-engine-cli scan test/fixtures/ --grep "LayerTreeHostImpl:snapshot"

# Scan multiple glob patterns for composite categories
trace-engine-cli scan "traces/*.json.gz" --cat devtools.timeline --top 10

# Find traces containing specific payload fields
trace-engine-cli scan fixtures/ --name TracingStartedInBrowser --fields args.data.frames
```

---

## Output Formats

### TOON (Default)
[TOON (Token-Oriented Object Notation)](https://github.com/toon-format/toon) is a compact, uniform tabular format designed to maximize information density for LLMs. It avoids verbose JSON syntax delimiters while preserving structured typing.

### Markdown (`--format md`)
Generates standard GitHub Flavored Markdown (GFM) tables and summary headings, ideal for terminal viewing or pasting into PR descriptions.

---

## Bundling Local DevTools Trace Engine

To run `trace-engine-cli` against the latest Chrome DevTools Trace Engine changes from a local `devtools-frontend` repository without needing Ninja:

```bash
DEVTOOLS_PATH=/path/to/devtools-frontend npm run bundle:engine
```

This compiles a zero-dependency bundle into `src/engine/vendor/trace_engine.js`. `trace-engine-cli` will automatically detect and prioritize this local vendor file over the npm module.

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
