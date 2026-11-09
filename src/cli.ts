// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { extractDiff } from './engine/extractors/diff.js';
import { extractEvents } from './engine/extractors/events.js';
import { extractFind } from './engine/extractors/find.js';
import { extractInsights } from './engine/extractors/insights.js';
import { extractInteractions } from './engine/extractors/interactions.js';
import { extractNavigations } from './engine/extractors/navigations.js';
import { extractNetwork } from './engine/extractors/network.js';
import { extractOverview } from './engine/extractors/overview.js';
import { extractProfile } from './engine/extractors/profile.js';
import { scanTraces } from './engine/extractors/scan.js';
import { extractScheduling } from './engine/extractors/scheduling.js';
import { extractShifts } from './engine/extractors/shifts.js';
import { extractTasks } from './engine/extractors/tasks.js';
import { type LoadedTrace, loadTraceFromFile } from './engine/loader.js';
import { formatResult } from './formatters/index.js';
import {
  parseTimeRange,
  parseTimeValue,
  resolveTimeRange,
  type TimeRange,
} from './utils/filter.js';

/**
 * Splits a comma-separated argument into trimmed, non-empty tokens.
 */
function parseCommaList(val?: unknown): string[] | undefined {
  if (!val) {
    return undefined;
  }
  const items = String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function positiveInteger(flag: string): (value: unknown) => number {
  return (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(num) || num < 1) {
      throw new Error(`--${flag} must be a positive integer. Received: ${value}`);
    }
    return num;
  };
}

function nonNegativeNumber(flag: string): (value: unknown) => number {
  return (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(`--${flag} must be a number >= 0. Received: ${value}`);
    }
    return num;
  };
}

function positiveDuration(flag: string): (value: unknown) => number {
  return (value) => {
    const ms = parseTimeValue(String(value));
    if (ms <= 0) {
      throw new Error(`--${flag} must be a duration > 0. Received: ${value}`);
    }
    return ms;
  };
}

// Declared per command, so commands that do not filter by time reject these options.
const TIME_RANGE_OPTION = {
  type: 'string',
  describe:
    'Time window (relative to trace start by default, e.g. "3500,4200", "3.5s,4.2s", "100ms-500ms")',
} as const;

const ABSOLUTE_TIMESTAMPS_OPTION = {
  type: 'boolean',
  default: false,
  describe:
    'Treat time ranges as raw absolute trace timestamps rather than relative to trace start (default: false)',
} as const;

type CliArgs = Record<string, unknown>;

function loadTrace(args: CliArgs): Promise<LoadedTrace> {
  return loadTraceFromFile(args.file as string, args.traceEngine as string | undefined);
}

async function loadTraceWithTimeRange(
  args: CliArgs,
): Promise<{ loaded: LoadedTrace; timeRange: TimeRange | undefined }> {
  const loaded = await loadTrace(args);
  const timeRange = resolveTimeRange(
    parseTimeRange(args.timeRange as string | undefined),
    loaded.parsedTrace.data.Meta.traceBounds,
    args.absoluteTimestamps as boolean,
  );
  return { loaded, timeRange };
}

export async function runCli(argv: string[]): Promise<void> {
  const cli = yargs(hideBin(argv))
    .scriptName('trace-engine-cli')
    .usage('$0 [command] <file> [options]')
    .option('format', {
      alias: 'f',
      type: 'string',
      choices: ['toon', 'md'] as const,
      default: 'toon',
      describe: 'Output format (toon or md)',
    })
    .option('trace-engine', {
      type: 'string',
      describe: 'Path to custom trace engine bundle',
    })
    .command(
      ['overview <file>', '$0 <file>'],
      'High-level trace metadata, Core Web Vitals, and main thread category breakdown (default command)',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractOverview(loaded, { timeRange });
        const isDefaultCmd = !args._.includes('overview');
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'overview',
            includeHint: isDefaultCmd,
          }),
        );
      },
    )
    .command(
      'insights <file>',
      'Diagnostic insight cards (LCP, INP, CLS, render-blocking, third-parties)',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('category', {
            type: 'string',
            choices: ['lcp', 'inp', 'cls', 'render-blocking', 'third-parties'] as const,
            describe: 'Filter insights by specific diagnostic category',
          })
          .option('navigation', {
            alias: ['nav'],
            type: 'string',
            describe: 'Navigation ID to inspect insights for',
          }),
      async (args) => {
        const loaded = await loadTrace(args);
        const result = extractInsights(loaded, {
          category: args.category as
            | 'lcp'
            | 'inp'
            | 'cls'
            | 'render-blocking'
            | 'third-parties'
            | undefined,
          navigationId: args.navigation as string | undefined,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'insights',
          }),
        );
      },
    )
    .command(
      'tasks <file>',
      'Long tasks, bottom-up and top-down TraceTree call aggregations',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('min-duration', {
            requiresArg: true,
            coerce: nonNegativeNumber('min-duration'),
            default: 50,
            describe: 'Minimum task duration threshold in milliseconds (default: 50ms)',
          })
          .option('tree', {
            type: 'string',
            choices: ['bottom-up', 'top-down'] as const,
            describe:
              "Generate aggregated call tree ('bottom-up' sorted by self-time, 'top-down' sorted by total duration)",
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 20,
            describe: 'Limit output to top N tasks (default: 20)',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractTasks(loaded, {
          minDurationMs: args.minDuration as number,
          tree: args.tree as 'bottom-up' | 'top-down' | undefined,
          top: args.top as number,
          timeRange,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'tasks',
          }),
        );
      },
    )
    .command(
      'find <file>',
      'Search for function execution instances, call frequency, and starvation intervals',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('function', {
            alias: ['fn', 'name'],
            type: 'string',
            demandOption: true,
            describe: 'Function name or pattern to search for',
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 50,
            describe: 'Maximum number of invocation entries to list (default: 50)',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractFind(loaded, {
          functionName: args.function as string,
          timeRange,
          limit: args.top as number,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'find',
          }),
        );
      },
    )
    .command(
      'profile <file>',
      'Time-bucketed CPU profiling progression across discrete intervals',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('bucket', {
            type: 'string',
            requiresArg: true,
            coerce: positiveDuration('bucket'),
            describe:
              'Bucket slice duration with optional unit (e.g. "50ms", "0.1s", "50", default: dynamic ~50ms)',
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 3,
            describe: 'Top N functions to include per time bucket (default: 3)',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractProfile(loaded, {
          timeRange,
          bucketMs: args.bucket,
          top: args.top as number,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'profile',
          }),
        );
      },
    )
    .command(
      'diff <file>',
      'Differential CPU profiling comparing two time windows in the trace',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('window-a', {
            type: 'string',
            demandOption: true,
            describe:
              'Baseline time window (e.g. "3500,4000", "3.5s,4.0s", relative to start by default)',
          })
          .option('window-b', {
            type: 'string',
            demandOption: true,
            describe:
              'Comparison time window (e.g. "4000,4500", "4.0s,4.5s", relative to start by default)',
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 20,
            describe: 'Maximum differential entries to return (default: 20)',
          })
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const loaded = await loadTrace(args);
        const rawRangeA = parseTimeRange(args['window-a'] as string);
        const rawRangeB = parseTimeRange(args['window-b'] as string);
        const bounds = loaded.parsedTrace.data.Meta.traceBounds;
        const isAbsolute = args.absoluteTimestamps as boolean;

        const windowA = resolveTimeRange(rawRangeA, bounds, isAbsolute);
        const windowB = resolveTimeRange(rawRangeB, bounds, isAbsolute);

        if (!windowA || !windowB) {
          throw new Error('Both --window-a and --window-b must be valid time ranges.');
        }

        const result = extractDiff(loaded, {
          windowA,
          windowB,
          top: args.top as number,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'diff',
          }),
        );
      },
    )
    .command(
      'scheduling <file>',
      'Async task and animation frame scheduling, cancellation, and churn metrics',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractScheduling(loaded, { timeRange });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'scheduling',
          }),
        );
      },
    )
    .command(
      'network <file>',
      'Network request waterfall, timings, and initiator chains',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('render-blocking', {
            type: 'boolean',
            default: false,
            describe: 'Filter only render-blocking requests',
          })
          .option('slowest', {
            alias: ['top', 'limit'],
            requiresArg: true,
            coerce: positiveInteger('slowest'),
            default: 20,
            describe: 'Limit output to N slowest requests (default: 20)',
          })
          .option('initiator-chain', {
            type: 'string',
            describe:
              'Trace the upstream request initiator chain matching a requestId or URL substring',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractNetwork(loaded, {
          renderBlocking: args.renderBlocking as boolean,
          slowest: args.slowest as number,
          initiatorChain: args.initiatorChain as string | undefined,
          timeRange,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'network',
          }),
        );
      },
    )
    .command(
      'interactions <file>',
      'User interaction latencies and target DOM elements',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractInteractions(loaded, { timeRange });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'interactions',
          }),
        );
      },
    )
    .command(
      'shifts <file>',
      'Layout shift clusters, scores, and culprit elements',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('events', {
            type: 'boolean',
            default: false,
            describe: 'Include individual shift events within each cluster',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const result = extractShifts(loaded, {
          timeRange,
          includeEvents: args.events as boolean,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'shifts',
          }),
        );
      },
    )
    .command(
      'events <file>',
      'Inspect and filter raw trace events by name, category, phase, or payload fields',
      (y) =>
        y
          .positional('file', {
            describe: 'Path to trace file (.json or .json.gz)',
            type: 'string',
            demandOption: true,
          })
          .option('name', {
            alias: ['event'],
            type: 'string',
            describe:
              'Event name or comma-separated event names (e.g. "LayoutShift,navigationStart")',
          })
          .option('category', {
            alias: ['cat'],
            type: 'string',
            describe: 'Filter by event category',
          })
          .option('phase', {
            alias: ['ph'],
            type: 'string',
            describe: 'Filter by event phase (e.g. "I", "X", "B", "E")',
          })
          .option('fields', {
            type: 'string',
            describe:
              'Comma-separated dot-notation field paths to extract (e.g. "name,ts,args.data.navigationId")',
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 50,
            describe: 'Maximum number of matching events to return (default: 50)',
          })
          .option('time-range', TIME_RANGE_OPTION)
          .option('absolute-timestamps', ABSOLUTE_TIMESTAMPS_OPTION),
      async (args) => {
        const { loaded, timeRange } = await loadTraceWithTimeRange(args);
        const names = parseCommaList(args.name);
        const fields = parseCommaList(args.fields);
        const result = extractEvents(loaded, {
          names,
          category: args.category as string | undefined,
          phase: args.phase as string | undefined,
          fields,
          timeRange,
          limit: args.top as number,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'events',
          }),
        );
      },
    )
    .command(
      ['navigations <file>', 'navs <file>'],
      'List all navigations in the trace and their InsightSet mappings',
      (y) =>
        y.positional('file', {
          describe: 'Path to trace file (.json or .json.gz)',
          type: 'string',
          demandOption: true,
        }),
      async (args) => {
        const loaded = await loadTrace(args);
        const result = extractNavigations(loaded);
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'navigations',
          }),
        );
      },
    )
    .command(
      'scan <targets..>',
      'Scan multiple trace files or directories for events, categories, phases, or text patterns',
      (y) =>
        y
          .positional('targets', {
            describe: 'Directory paths, glob patterns, or trace file paths (.json, .json.gz)',
            type: 'string',
            array: true,
            demandOption: true,
          })
          .option('name', {
            alias: ['event'],
            type: 'string',
            describe: 'Event name or comma-separated event names (e.g. "LayoutShift,RunTask")',
          })
          .option('category', {
            alias: ['cat'],
            type: 'string',
            describe: 'Filter by event category',
          })
          .option('phase', {
            alias: ['ph'],
            type: 'string',
            describe: 'Filter by event phase (e.g. "X", "I", "B", "E")',
          })
          .option('grep', {
            alias: ['pattern'],
            type: 'string',
            describe: 'Raw text or substring to search for within trace events or payloads',
          })
          .option('fields', {
            type: 'string',
            describe:
              'Comma-separated dot-notation property paths that must exist on matching events',
          })
          .option('top', {
            alias: ['limit'],
            requiresArg: true,
            coerce: positiveInteger('top'),
            default: 50,
            describe: 'Maximum number of matched files to return (default: 50)',
          }),
      async (args) => {
        const rawTargets = Array.isArray(args.targets)
          ? (args.targets as string[])
          : [String(args.targets)];
        const names = parseCommaList(args.name);
        const fields = parseCommaList(args.fields);
        const result = scanTraces({
          targets: rawTargets,
          names,
          category: args.category as string | undefined,
          phase: args.phase as string | undefined,
          grep: args.grep as string | undefined,
          fields,
          limit: args.top as number,
        });
        console.log(
          formatResult(result, {
            format: args.format as 'toon' | 'md',
            type: 'scan',
          }),
        );
      },
    )
    .demandCommand(1, 'Please specify a trace file or subcommand.')
    .strict()
    .fail((msg, err) => {
      if (err) {
        throw err;
      }
      if (msg) {
        if (msg.startsWith('Unknown argument:')) {
          const arg = msg.replace('Unknown argument:', '').trim();
          if (arg.endsWith('.json') || arg.endsWith('.json.gz')) {
            throw new Error(
              `Command accepts only a single trace file. Received multiple files. To search across multiple files or directories, use:\n  trace-engine-cli scan <dir-or-glob> [options]`,
            );
          }
        }
        throw new Error(msg);
      }
      throw new Error('Command execution failed.');
    })
    .help();

  const userArgs = hideBin(argv);
  if (userArgs.length === 0) {
    cli.showHelp();
    return;
  }

  await cli.parseAsync();
}
