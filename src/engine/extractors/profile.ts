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

import type { TimeRange } from '../../utils/filter.js';
import { microToMilli, milliToMicro, round } from '../../utils/units.js';
import { getRendererThread, MISSING_CPU_SAMPLES, rendererCpuFilter } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { ProfileResult } from '../types.js';

export const MIN_BUCKET_MS = 0.01;
export const MAX_BUCKETS = 1000;

export interface ExtractProfileOptions {
  threadId?: string;
  timeRange?: TimeRange;
  bucketMs?: number;
  top?: number;
}

/**
 * Generates time-bucketed CPU profiles across a time range.
 */
export function extractProfile(
  loadedTrace: LoadedTrace,
  options?: ExtractProfileOptions,
): ProfileResult {
  const { engine, parsedTrace } = loadedTrace;
  const traceBounds = parsedTrace.data.Meta.traceBounds;
  const startMs = options?.timeRange
    ? options.timeRange.startMs
    : round(microToMilli(traceBounds.min));
  const endMs = options?.timeRange ? options.timeRange.endMs : round(microToMilli(traceBounds.max));

  const totalRangeMs = Math.max(1, endMs - startMs);
  if (options?.bucketMs !== undefined && options.bucketMs < MIN_BUCKET_MS) {
    throw new Error(
      `Bucket size ${options.bucketMs}ms is below the minimum of ${MIN_BUCKET_MS}ms.`,
    );
  }
  const bucketSizeMs = round(options?.bucketMs ?? Math.max(10, totalRangeMs / 20));
  const topCount = options?.top ?? 3;

  const rangeMs = endMs - startMs;
  if (bucketSizeMs < rangeMs / MAX_BUCKETS) {
    const bucketCount = Math.ceil(rangeMs / bucketSizeMs);
    const minBucketMs = Math.ceil((rangeMs / MAX_BUCKETS) * 100) / 100;
    throw new Error(
      `Bucket size ${bucketSizeMs}ms creates ${bucketCount} buckets over ${round(rangeMs)}ms. The maximum is ${MAX_BUCKETS}. Use a bucket size of at least ${minBucketMs}ms.`,
    );
  }

  const result: ProfileResult = {
    threadId: options?.threadId,
    timeRange: { startMs, endMs },
    bucketSizeMs,
    buckets: [],
  };

  const mainThread = getRendererThread(parsedTrace.data, options?.threadId);
  if (!mainThread?.entries?.length) {
    return result;
  }

  if (!mainThread.profileCalls.length) result.warnings = [MISSING_CPU_SAMPLES];

  const cpuFilter = rendererCpuFilter(loadedTrace);
  let currentStart = startMs;
  while (currentStart < endMs) {
    const currentEnd = Math.min(endMs, round(currentStart + bucketSizeMs));
    if (currentEnd <= currentStart) break;

    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(mainThread.entries, {
      textFilter: { accept: () => true },
      filters: [cpuFilter],
      startTime: engine.Types.Timing.Micro(milliToMicro(currentStart)),
      endTime: engine.Types.Timing.Micro(milliToMicro(currentEnd)),
    });

    const funcList: Array<{ name: string; url?: string; selfTimeMs: number }> = [];
    let totalActiveMs = 0;

    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      const frame = node.event ? engine.Extras.TraceTree.eventStackFrame(node.event) : null;
      const fnName = frame?.functionName || node.event?.name || String(node.id) || 'Unknown';

      // Exclude generic root markers from active work
      if (fnName === '(root)' || fnName === '(idle)') continue;

      const selfTimeMs = microToMilli(node.selfTime);
      totalActiveMs += selfTimeMs;
      funcList.push({
        name: fnName,
        url: frame?.url || undefined,
        selfTimeMs: round(selfTimeMs),
      });
    }

    funcList.sort((a, b) => b.selfTimeMs - a.selfTimeMs);

    const topFunctions = funcList.slice(0, topCount).map((f) => ({
      name: f.name,
      url: f.url,
      selfTimeMs: f.selfTimeMs,
      selfTimePct: totalActiveMs > 0 ? round((f.selfTimeMs / totalActiveMs) * 100, 1) : 0,
    }));

    result.buckets.push({
      startMs: round(currentStart),
      endMs: round(currentEnd),
      totalActiveMs: round(totalActiveMs),
      topFunctions,
    });

    currentStart = currentEnd;
  }

  return result;
}
