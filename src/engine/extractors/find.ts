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

import { isEventInBounds, type TimeRange } from '../../utils/filter.js';
import { microToMilli, round } from '../../utils/units.js';
import { getMainRendererThread } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { FindCallInstance, FindIntervalItem, FindResult } from '../types.js';

export interface ExtractFindOptions {
  functionName: string;
  timeRange?: TimeRange;
  limit?: number;
}

/**
 * Searches for all executions of a specific function name or pattern.
 */
export function extractFind(loadedTrace: LoadedTrace, options: ExtractFindOptions): FindResult {
  const { engine, parsedTrace } = loadedTrace;
  const functionQuery = options.functionName.trim();
  const timeRange = options.timeRange;
  const limit = options.limit ?? 50;

  const result: FindResult = {
    functionQuery,
    timeRange,
    totalCalls: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    calls: [],
  };

  const mainThread = getMainRendererThread(parsedTrace.data);
  if (!mainThread || !functionQuery) {
    return result;
  }

  const queryLower = functionQuery.toLowerCase();
  const matchedCalls: FindCallInstance[] = [];

  for (const entry of mainThread.entries) {
    const startMs = microToMilli(entry.ts);
    const durMs = microToMilli(entry.dur ?? 0);

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const frame = engine.Extras.TraceTree.eventStackFrame(entry);
    const fnName = frame?.functionName || entry.name || '';

    if (fnName.toLowerCase().includes(queryLower)) {
      matchedCalls.push({
        timestampMs: round(startMs),
        durationMs: round(durMs),
        url: frame?.url,
        lineNumber: frame?.lineNumber,
        columnNumber: frame?.columnNumber,
      });
    }
  }

  result.totalCalls = matchedCalls.length;
  if (matchedCalls.length > 0) {
    let totalDur = 0;
    for (const c of matchedCalls) {
      totalDur += c.durationMs;
    }
    result.totalDurationMs = round(totalDur);
    result.avgDurationMs = round(totalDur / matchedCalls.length);
    result.firstCallMs = matchedCalls[0].timestampMs;
    result.lastCallMs = matchedCalls[matchedCalls.length - 1].timestampMs;
    result.calls = matchedCalls.slice(0, limit);

    // Build interval distribution if timeRange or trace bounds exist
    const traceBounds = parsedTrace.data.Meta.traceBounds;
    const windowStart = timeRange ? timeRange.startMs : microToMilli(traceBounds.min);
    const windowEnd = timeRange ? timeRange.endMs : microToMilli(traceBounds.max);
    const totalSpan = windowEnd - windowStart;

    if (totalSpan > 0) {
      const numIntervals = Math.min(5, Math.max(2, Math.floor(totalSpan / 100)));
      const intervalSize = totalSpan / numIntervals;
      const intervals: FindIntervalItem[] = [];

      for (let i = 0; i < numIntervals; i++) {
        const iStart = round(windowStart + i * intervalSize);
        const iEnd = round(
          i === numIntervals - 1 ? windowEnd : windowStart + (i + 1) * intervalSize,
        );
        let callsInInterval = 0;
        let durInInterval = 0;

        for (const c of matchedCalls) {
          if (c.timestampMs >= iStart && c.timestampMs < iEnd) {
            callsInInterval++;
            durInInterval += c.durationMs;
          }
        }

        intervals.push({
          startMs: iStart,
          endMs: iEnd,
          calls: callsInInterval,
          totalDurationMs: round(durInInterval),
        });
      }

      result.intervals = intervals;
    }
  }

  return result;
}
