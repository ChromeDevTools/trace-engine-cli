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
import type { SchedulingResult, SchedulingStatItem } from '../types.js';

export interface ExtractSchedulingOptions {
  timeRange?: TimeRange;
}

/**
 * Extracts async task and animation frame scheduling, cancellation, and execution metrics.
 */
export function extractScheduling(
  loadedTrace: LoadedTrace,
  options?: ExtractSchedulingOptions,
): SchedulingResult {
  const { parsedTrace, rawEvents } = loadedTrace;
  const timeRange = options?.timeRange;

  const animStats: SchedulingStatItem = {
    scheduledCount: 0,
    canceledCount: 0,
    executedCount: 0,
    cancellationRatePct: 0,
  };

  const timerStats: SchedulingStatItem = {
    scheduledCount: 0,
    canceledCount: 0,
    executedCount: 0,
    cancellationRatePct: 0,
  };

  const mainThread = getMainRendererThread(parsedTrace.data);
  // biome-ignore lint/suspicious/noExplicitAny: generic event scanning
  const eventsToScan: any[] = mainThread?.entries || rawEvents || [];

  for (const entry of eventsToScan) {
    const startMs = microToMilli(entry.ts);
    const durMs = microToMilli(entry.dur ?? 0);

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const name = entry.name;
    if (name === 'RequestAnimationFrame') {
      animStats.scheduledCount++;
    } else if (name === 'CancelAnimationFrame') {
      animStats.canceledCount++;
    } else if (name === 'FireAnimationFrame') {
      animStats.executedCount++;
    } else if (name === 'TimerInstall') {
      timerStats.scheduledCount++;
    } else if (name === 'TimerRemove') {
      timerStats.canceledCount++;
    } else if (name === 'TimerFire') {
      timerStats.executedCount++;
    }
  }

  animStats.cancellationRatePct =
    animStats.scheduledCount > 0
      ? round((animStats.canceledCount / animStats.scheduledCount) * 100, 1)
      : 0;

  timerStats.cancellationRatePct =
    timerStats.scheduledCount > 0
      ? round((timerStats.canceledCount / timerStats.scheduledCount) * 100, 1)
      : 0;

  const warnings: string[] = [];
  let churnDetected = false;

  if (animStats.cancellationRatePct >= 70 && animStats.scheduledCount >= 5) {
    churnDetected = true;
    warnings.push(
      `High animation frame cancellation rate (${animStats.cancellationRatePct}%). ${animStats.canceledCount} of ${animStats.scheduledCount} scheduled rAFs were canceled before execution.`,
    );
  }

  if (timerStats.cancellationRatePct >= 70 && timerStats.scheduledCount >= 5) {
    churnDetected = true;
    warnings.push(
      `High timer cancellation rate (${timerStats.cancellationRatePct}%). ${timerStats.canceledCount} of ${timerStats.scheduledCount} installed timers were removed before firing.`,
    );
  }

  return {
    timeRange,
    animationFrames: animStats,
    timers: timerStats,
    churnDetected,
    warnings,
  };
}
