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

import { isEventInBounds, type TimeRange } from '../utils/filter.js';
import { microToMilli } from '../utils/units.js';
import type { LoadedTrace, ParsedTrace } from './loader.js';
import type { ThreadItem } from './types.js';

type MapValue<T> = T extends Map<unknown, infer V> ? V : never;
type RendererProcess = MapValue<NonNullable<ParsedTrace['data']['Renderer']>['processes']>;

export type RendererThread = MapValue<RendererProcess['threads']>;
export type InsightSet = MapValue<NonNullable<ParsedTrace['insights']>>;
export type InsightModels = InsightSet['model'];

/**
 * Finds the primary main renderer thread (CrRendererMain) in the trace.
 */
export function getMainRendererThread(data: ParsedTrace['data']): RendererThread | null {
  const processes = data.Renderer?.processes;
  if (!processes) return null;

  // 1. Prefer main frame process
  for (const proc of processes.values()) {
    if (proc.isOnMainFrame && proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries.length > 0) {
          return thread;
        }
      }
    }
  }

  // 2. Fallback to any process with CrRendererMain
  for (const proc of processes.values()) {
    if (proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries.length > 0) {
          return thread;
        }
      }
    }
  }

  return null;
}

export function getRendererThread(
  data: ParsedTrace['data'],
  threadId?: string,
): RendererThread | null {
  if (threadId === undefined) return getMainRendererThread(data);

  for (const [pid, process] of data.Renderer?.processes ?? []) {
    for (const [tid, thread] of process.threads) {
      if (threadId === `${pid}:${tid}` && thread.entries.length > 0) return thread;
    }
  }
  throw new Error(
    `Unknown renderer thread "${threadId}". Use trace-engine-cli threads <file> to list PID:TID values.`,
  );
}

export function listRendererThreads(data: ParsedTrace['data']): ThreadItem[] {
  const threads: ThreadItem[] = [];
  const defaultThread = getMainRendererThread(data);
  for (const [pid, process] of data.Renderer?.processes ?? []) {
    const frames = [...(data.Meta.frameByProcessId.get(pid)?.values() ?? [])];
    const frameUrls = [...new Set(frames.map((frame) => frame.url).filter(Boolean))];
    for (const [tid, thread] of process.threads) {
      if (!thread.entries.length) continue;
      threads.push({
        id: `${pid}:${tid}`,
        name: thread.name,
        frameUrls,
        isDefault: thread === defaultThread,
        hasCpuSamples: thread.profileCalls.length > 0,
      });
    }
  }
  return threads;
}

export function rendererCpuFilter({ engine, parsedTrace }: LoadedTrace) {
  const entryToNode = parsedTrace.data.Renderer?.entryToNode;
  return {
    // The renderer tree discards overlapping entries that cannot represent nested CPU work.
    accept: (event: RendererThread['entries'][number]) =>
      entryToNode?.has(event) === true && !engine.Types.Events.isPhaseAsync(event.ph),
  };
}

export function getNavigationId(navigation: InsightSet['navigation']): string | undefined {
  const args = navigation?.args;
  if (args && 'data' in args) return args.data?.navigationId;
  return undefined;
}

export interface InsightEntryResult {
  insightSetId: string;
  navigationId?: string;
  model: InsightModels;
}

/**
 * Finds a navigation by trace ID or InsightSet ID. When no navigation is given,
 * prefer the main-frame load with an LCP measurement over pre-navigation activity.
 */
export function findInsightEntry(
  parsedTrace: ParsedTrace,
  navigationId?: string,
  timeRange?: TimeRange,
): InsightEntryResult | undefined {
  let first: InsightEntryResult | undefined;
  let firstNavigation: InsightEntryResult | undefined;
  let firstWithLcp: InsightEntryResult | undefined;
  for (const [key, set] of parsedTrace.insights ?? []) {
    if (!isEventInBounds(microToMilli(set.bounds.min), microToMilli(set.bounds.range), timeRange)) {
      continue;
    }
    const traceId = getNavigationId(set.navigation);
    const entry = { insightSetId: key, navigationId: traceId, model: set.model };
    if (navigationId) {
      if (key === navigationId || set.id === navigationId || traceId === navigationId) return entry;
      continue;
    }
    first ??= entry;
    if (set.navigation && set.frameId === parsedTrace.data.Meta.mainFrameId) {
      firstNavigation ??= entry;
      if (set.model.LCPBreakdown?.lcpMs !== undefined) firstWithLcp ??= entry;
    }
  }
  return firstWithLcp ?? firstNavigation ?? first;
}

export const PAGE_TRACE_CAPTURE_HINT =
  'Record and save a trace from the DevTools Performance panel, or send CDP Tracing.start on a page target session.';

export const UNCONFIRMED_LAYOUT_SHIFT_CAPTURE =
  'No layout shifts or loading-category events were observed in this navigation recording. If you used CDP, check whether the loading category was enabled.';

export const MISSING_CPU_SAMPLES =
  'No CPU samples were recorded for this thread. Recapture with JavaScript samples enabled in the DevTools Performance panel, or include disabled-by-default-v8.cpu_profiler in CDP.';

const LOADING_CATEGORY = /(?:^|,)loading(?:,|$)/;

export function shouldWarnAboutLayoutShiftCapture({
  rawEvents,
  parsedTrace,
}: LoadedTrace): boolean {
  const { Meta, LayoutShifts } = parsedTrace.data;
  // A recording of an already-loaded page may contain no loading events even with CLS enabled.
  if (!Meta.mainFrameNavigations.length || LayoutShifts?.clusters.length) return false;

  return !rawEvents.some(
    (event) =>
      typeof event === 'object' &&
      event !== null &&
      (('name' in event && event.name === 'LayoutShift') ||
        ('cat' in event && typeof event.cat === 'string' && LOADING_CATEGORY.test(event.cat))),
  );
}

/**
 * Traverses an object along a dot-separated property path.
 */
export function getPropertyByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
