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

/**
 * Core Web Vitals rating category.
 */
export type CwvRating = 'good' | 'needs-improvement' | 'poor';

/**
 * High-level summary of trace bounds, Core Web Vitals, and main thread category distribution.
 * All duration and timestamp properties are normalized to milliseconds (ms).
 */
export interface OverviewResult {
  bounds: {
    minMs: number;
    maxMs: number;
    durationMs: number;
  };
  mainUrl: string | null;
  navigationStartMs: number | null;
  coreWebVitals: {
    fcp: { valueMs: number; rating: CwvRating } | null;
    lcp: {
      valueMs: number;
      rating: CwvRating;
      element?: string;
      url?: string;
    } | null;
    cls: {
      value: number;
      rating: CwvRating;
      worstClusterScore?: number;
    } | null;
    inp: {
      valueMs: number;
      rating: CwvRating;
      interactionType?: string;
    } | null;
  };
  mainThreadBreakdown: {
    scriptingMs: number;
    layoutMs: number;
    renderingMs: number;
    gcMs: number;
    systemMs: number;
    idleMs: number;
    totalMs: number;
  };
  warnings: string[];
}

/**
 * Detailed breakdown of Largest Contentful Paint subparts.
 */
export interface LcpBreakdownInsight {
  totalLcpMs: number;
  ttfbMs: number;
  loadDelayMs: number;
  loadDurationMs: number;
  renderDelayMs: number;
  lcpElement?: string;
  lcpUrl?: string;
}

/**
 * Detailed breakdown of Interaction to Next Paint longest interaction.
 */
export interface InpBreakdownInsight {
  totalDurationMs: number;
  inputDelayMs: number;
  processingDurationMs: number;
  presentationDelayMs: number;
  eventType: string;
  target?: string;
}

/**
 * Diagnostic layout shift culprit information.
 */
export interface ClsCulpritInsight {
  score: number;
  timestampMs: number;
  culpritNodes: string[];
}

/**
 * Render-blocking stylesheet or script resource.
 */
export interface RenderBlockingInsight {
  url: string;
  durationMs: number;
  transferSizeBytes: number;
}

/**
 * Third-party entity resource usage and main thread CPU execution time.
 */
export interface ThirdPartyEntityInsight {
  entityName: string;
  transferSizeBytes: number;
  mainThreadTimeMs: number;
}

/**
 * Diagnostics and metric breakdowns for CWV bottlenecks.
 */
export interface InsightsResult {
  navigationId?: string;
  lcpBreakdown?: LcpBreakdownInsight | null;
  inpBreakdown?: InpBreakdownInsight | null;
  clsCulprits?: ClsCulpritInsight[];
  renderBlocking?: RenderBlockingInsight[];
  thirdParties?: ThirdPartyEntityInsight[];
  warnings?: string[];
}

/**
 * Executed task or aggregated call tree node on the main thread.
 */
export interface TaskItem {
  startTimeMs: number;
  durationMs: number;
  selfTimeMs: number;
  functionName: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/**
 * Aggregated main thread task execution details.
 */
export interface TasksResult {
  mode: 'list' | 'top-down' | 'bottom-up';
  tasks: TaskItem[];
}

/**
 * Individual network request details and timing waterfall.
 */
export interface NetworkRequestItem {
  requestId?: string;
  url: string;
  mimeType: string;
  priority: string;
  timing: {
    queueingMs: number;
    dnsMs: number;
    sslMs: number;
    ttfbMs: number;
    downloadMs: number;
    totalDurationMs: number;
  };
  transferSizeBytes: number;
  renderBlocking?: boolean;
}

/**
 * Single node in a network request initiator chain.
 */
export interface InitiatorChainItem {
  url: string;
  initiatorUrl?: string;
  type?: string;
}

/**
 * Network requests waterfall and initiator analysis result.
 */
export interface NetworkResult {
  initiatorChain?: InitiatorChainItem[];
  requests: NetworkRequestItem[];
}

/**
 * User interaction timing details.
 */
export interface InteractionItem {
  eventType: string;
  startTimeMs: number;
  durationMs: number;
  inputDelayMs: number;
  processingDurationMs: number;
  presentationDelayMs: number;
  targetElement?: string;
  interactionId?: number;
}

/**
 * User interaction timeline result.
 */
export interface InteractionsResult {
  interactions: InteractionItem[];
}

/**
 * DOM node identified as a layout shift culprit.
 */
export interface ShiftCulprit {
  nodeId?: number;
  tagName?: string;
  selector?: string;
  debugName?: string;
  scoreDelta?: number;
}

/**
 * Impacted DOM node in an individual layout shift event.
 */
export interface ShiftImpactedNodeItem {
  nodeId?: number;
  tagName?: string;
  selector?: string;
  debugName?: string;
  oldRect?: [number, number, number, number];
  newRect?: [number, number, number, number];
}

/**
 * Individual layout shift event within a cluster.
 */
export interface ShiftIndividualEvent {
  timestampMs: number;
  score: number;
  weightedScoreDelta?: number;
  navigationId?: string;
  hadRecentInput?: boolean;
  impactedNodes?: ShiftImpactedNodeItem[];
}

/**
 * Layout shift session window cluster.
 */
export interface ShiftClusterItem {
  timestampMs: number;
  durationMs: number;
  cumulativeScore: number;
  navigationId?: string;
  culprits: ShiftCulprit[];
  events?: ShiftIndividualEvent[];
}

/**
 * Layout shifts analysis result.
 */
export interface ShiftsResult {
  clusters: ShiftClusterItem[];
}

/**
 * Individual invocation instance of a searched function.
 */
export interface FindCallInstance {
  timestampMs: number;
  durationMs: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/**
 * Temporal breakdown interval for function call distribution.
 */
export interface FindIntervalItem {
  startMs: number;
  endMs: number;
  calls: number;
  totalDurationMs: number;
}

/**
 * Result of searching for a specific function's executions across a trace.
 */
export interface FindResult {
  functionQuery: string;
  timeRange?: { startMs: number; endMs: number };
  totalCalls: number;
  totalDurationMs: number;
  avgDurationMs: number;
  firstCallMs?: number;
  lastCallMs?: number;
  calls: FindCallInstance[];
  intervals?: FindIntervalItem[];
}

/**
 * Single time bucket summary in profile progression.
 */
export interface ProfileBucketItem {
  startMs: number;
  endMs: number;
  totalActiveMs: number;
  topFunctions: Array<{
    name: string;
    selfTimeMs: number;
    selfTimePct: number;
  }>;
}

/**
 * Time-bucketed CPU profiling result.
 */
export interface ProfileResult {
  timeRange: { startMs: number; endMs: number };
  bucketSizeMs: number;
  buckets: ProfileBucketItem[];
}

/**
 * Single function comparison entry in a differential profile.
 */
export interface DiffEntryItem {
  functionName: string;
  url?: string;
  selfTimeMsA: number;
  selfTimePctA: number;
  selfTimeMsB: number;
  selfTimePctB: number;
  deltaPct: number;
}

/**
 * Differential profile result comparing two trace intervals.
 */
export interface DiffResult {
  windowA: { startMs: number; endMs: number; durationMs: number };
  windowB: { startMs: number; endMs: number; durationMs: number };
  entries: DiffEntryItem[];
}

/**
 * Lifecycle metrics for scheduled async primitives (rAF, Timers).
 */
export interface SchedulingStatItem {
  scheduledCount: number;
  canceledCount: number;
  executedCount: number;
  cancellationRatePct: number;
}

/**
 * Async task and animation frame scheduling lifecycle result.
 */
export interface SchedulingResult {
  timeRange?: { startMs: number; endMs: number };
  animationFrames: SchedulingStatItem;
  timers: SchedulingStatItem;
  churnDetected: boolean;
  warnings: string[];
}

/**
 * Raw trace event dictionary from Chromium trace JSON payload.
 */
export interface RawTraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
}

/**
 * Raw trace event entry.
 */
export interface RawTraceEventItem {
  /** Event name (e.g. 'LayoutShift', 'RunTask'). */
  name: string;
  /** Normalized timestamp in milliseconds relative to trace start. */
  tsMs: number;
  /** Normalized event duration in milliseconds. */
  durMs?: number;
  /** Trace event category. */
  cat?: string;
  /** Chromium event phase code (e.g. 'X', 'I', 'B', 'E'). */
  ph?: string;
  /** Process ID. */
  pid?: number;
  /** Thread ID. */
  tid?: number;
  /** Raw event payload arguments. */
  args?: Record<string, unknown>;
  /** Extracted property values mapped from dot-notation query fields. */
  selectedFields?: Record<string, unknown>;
}

/**
 * Raw trace event filtering result.
 */
export interface EventsResult {
  /** Total events matching the filter criteria across the trace. */
  totalMatched: number;
  /** Number of events returned in the events array (capped by limit). */
  returned: number;
  /** Array of matched and projected event items. */
  events: RawTraceEventItem[];
}

/**
 * Navigation entry from trace metadata.
 */
export interface NavigationItem {
  /** Navigation identifier from trace event data (args.data.navigationId). */
  navigationId: string;
  /** Corresponding Trace Engine InsightSet identifier (e.g. 'NAVIGATION_0'). */
  insightSetId?: string;
  /** Frame identifier where navigation occurred. */
  frameId?: string;
  /** Navigation URL or loader URL. */
  url: string;
  /** Timestamp in milliseconds relative to trace start. */
  timestampMs: number;
  /** Whether the navigation belongs to the primary main frame. */
  isMainFrame: boolean;
  /** Whether an InsightSet exists for this navigation. */
  hasInsights: boolean;
}

/**
 * Navigation list result.
 */
export interface NavigationsResult {
  /** Total number of navigations detected. */
  total: number;
  /** Ordered list of navigation entries. */
  navigations: NavigationItem[];
  /** Unique InsightSet identifiers present in the parsed trace. */
  insightSetIds: string[];
}

/**
 * Telemetry and match summary for a single trace file matched during a scan.
 */
export interface ScanMatchedFile {
  /** Relative or normalized path to the trace file. */
  file: string;
  /** Total number of events matching query criteria in this file. */
  matchCount: number;
  /** Unique categories associated with the matched events. */
  categories: string[];
  /** Name of the first matching event found in the trace. */
  firstEventName?: string;
  /** Raw absolute timestamp of the first matching event in milliseconds (trace bounds uncalculated). */
  firstEventTsMs?: number;
}

/**
 * Result of scanning multiple trace files or directories.
 */
export interface ScanResult {
  /** Search filters applied to the scan. */
  query: {
    names?: string[];
    category?: string;
    phase?: string;
    grep?: string;
    fields?: string[];
  };
  /** Total trace files discovered and inspected. */
  totalFilesScanned: number;
  /** Total trace files that contained at least one match. */
  totalFilesMatched: number;
  /** Total matching events across all inspected files. */
  totalEventsMatched: number;
  /** Ordered list of matched files, sorted by match count descending. */
  matchedFiles: ScanMatchedFile[];
}
