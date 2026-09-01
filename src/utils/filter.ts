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

import { microToMilli, round } from './units.js';

/**
 * Represents a time window in milliseconds.
 */
export interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * Trace boundary timestamps in microseconds (DevTools Meta.traceBounds).
 */
export interface RawTraceBounds {
  min: number;
  max: number;
  range?: number;
}

/**
 * Parses a time string with optional unit suffix into milliseconds.
 * Supported units: 's' (seconds), 'ms' (milliseconds), 'us'/'µs' (microseconds).
 *
 * @example
 * parseTimeValue("3.5s") // 3500
 * parseTimeValue("50ms") // 50
 * parseTimeValue("5000us") // 5
 * parseTimeValue("100") // 100
 */
export function parseTimeValue(valueStr: string): number {
  const trimmed = valueStr.trim();
  const match = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(s|ms|us|µs)?$/i);

  if (!match) {
    throw new Error(
      `Invalid time value: "${valueStr}". Expected number with optional unit (e.g. "3.5s", "50ms", "5000us").`,
    );
  }

  const num = Number.parseFloat(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();

  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric value: "${valueStr}".`);
  }

  if (unit === 's') {
    return num * 1000;
  }
  if (unit === 'us' || unit === 'µs') {
    return num / 1000;
  }
  return num;
}

/**
 * Parses a time range string in formats such as:
 * - "100,500" or "100:500"
 * - "3.5s,4.2s" or "3.5s..4.2s"
 * - "100ms-500ms"
 */
export function parseTimeRange(rangeStr?: string): TimeRange | undefined {
  if (!rangeStr?.trim()) return undefined;

  const trimmed = rangeStr.trim();
  let parts: string[] = [];

  if (trimmed.includes('..')) {
    parts = trimmed.split('..');
  } else if (trimmed.includes(',')) {
    parts = trimmed.split(',');
  } else if (trimmed.includes(':')) {
    parts = trimmed.split(':');
  } else if (trimmed.includes('-') && !trimmed.startsWith('-')) {
    // Split on '-' only if not a single negative number
    const idx = trimmed.indexOf('-', 1);
    if (idx !== -1) {
      parts = [trimmed.slice(0, idx), trimmed.slice(idx + 1)];
    }
  }

  if (parts.length !== 2) {
    throw new Error(
      `Invalid time range format: "${rangeStr}". Expected format: "<start>,<end>" (e.g. "3500,4200" or "3.5s,4.2s").`,
    );
  }

  const startMs = parseTimeValue(parts[0]);
  const endMs = parseTimeValue(parts[1]);

  if (startMs > endMs) {
    throw new Error(
      `Invalid time range values: "${rangeStr}". Start (${startMs}ms) must be <= end (${endMs}ms).`,
    );
  }

  return { startMs, endMs };
}

/**
 * Resolves and validates a TimeRange against trace bounds.
 * Defaults to relative timestamps (0ms = trace origin).
 * When `isAbsolute` is true, values are treated as raw trace timestamps.
 */
export function resolveTimeRange(
  range: TimeRange | undefined,
  traceBounds: RawTraceBounds,
  isAbsolute = false,
): TimeRange | undefined {
  if (!range) return undefined;

  const boundsMinMs = microToMilli(traceBounds.min);
  const boundsMaxMs = microToMilli(traceBounds.max);
  const traceDurationMs = round(boundsMaxMs - boundsMinMs);

  let startMs: number;
  let endMs: number;

  if (isAbsolute) {
    startMs = range.startMs;
    endMs = range.endMs;

    // Check if range is completely outside trace bounds
    if (endMs < boundsMinMs || startMs > boundsMaxMs) {
      throw new Error(
        `Time range [${round(startMs)}ms, ${round(endMs)}ms] is outside trace bounds [${round(boundsMinMs)}ms, ${round(boundsMaxMs)}ms]. Trace duration is ${traceDurationMs}ms. Did you mean to omit --absolute-timestamps?`,
      );
    }

    startMs = Math.max(boundsMinMs, startMs);
    endMs = Math.min(boundsMaxMs, endMs);
  } else {
    // Relative to trace start
    startMs = boundsMinMs + range.startMs;
    endMs = boundsMinMs + range.endMs;

    // Check if relative range is completely outside trace duration
    if (range.startMs > traceDurationMs || range.endMs < 0) {
      throw new Error(
        `Time range [${round(range.startMs)}ms, ${round(range.endMs)}ms] is outside trace duration [0ms, ${traceDurationMs}ms] (trace bounds: [${round(boundsMinMs)}ms, ${round(boundsMaxMs)}ms]). Did you mean to add --absolute-timestamps?`,
      );
    }

    startMs = Math.max(boundsMinMs, startMs);
    endMs = Math.min(boundsMaxMs, endMs);
  }

  return {
    startMs: round(startMs),
    endMs: round(endMs),
  };
}

/**
 * Checks if a timestamp in milliseconds falls within a time range.
 */
export function isTimestampInBounds(timestampMs: number, range?: TimeRange): boolean {
  if (!range) return true;
  return timestampMs >= range.startMs && timestampMs <= range.endMs;
}

/**
 * Checks if an event with start time and duration overlaps with a time range.
 */
export function isEventInBounds(
  startMs: number,
  durationMs: number | undefined,
  range?: TimeRange,
): boolean {
  if (!range) return true;
  const endMs = durationMs !== undefined ? startMs + durationMs : startMs;
  return endMs >= range.startMs && startMs <= range.endMs;
}
