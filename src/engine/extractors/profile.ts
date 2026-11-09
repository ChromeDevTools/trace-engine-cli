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
import { microToMilli, round } from '../../utils/units.js';
import { getMainRendererThread } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { ProfileResult } from '../types.js';

export interface ExtractProfileOptions {
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
  const bucketSizeMs = options?.bucketMs ?? Math.max(10, round(totalRangeMs / 20));
  const topCount = options?.top ?? 3;

  const result: ProfileResult = {
    timeRange: { startMs, endMs },
    bucketSizeMs,
    buckets: [],
  };

  const mainThread = getMainRendererThread(parsedTrace.data);
  if (!mainThread?.entries?.length) {
    return result;
  }

  let currentStart = startMs;
  while (currentStart < endMs) {
    const currentEnd = Math.min(endMs, round(currentStart + bucketSizeMs));
    if (currentEnd <= currentStart) break;

    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(mainThread.entries, {
      textFilter: { accept: () => true },
      filters: [],
      startTime: engine.Types.Timing.Milli(currentStart),
      endTime: engine.Types.Timing.Milli(currentEnd),
    });

    const funcList: Array<{ name: string; selfTimeMs: number }> = [];
    let totalActiveMs = 0;

    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      const frame = node.event ? engine.Extras.TraceTree.eventStackFrame(node.event) : null;
      const fnName = frame?.functionName || node.event?.name || String(node.id) || 'Unknown';

      // Exclude generic root markers from active work
      if (fnName === '(root)' || fnName === '(idle)') continue;

      totalActiveMs += node.selfTime;
      funcList.push({
        name: fnName,
        selfTimeMs: round(node.selfTime),
      });
    }

    funcList.sort((a, b) => b.selfTimeMs - a.selfTimeMs);

    const topFunctions = funcList.slice(0, topCount).map((f) => ({
      name: f.name,
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
