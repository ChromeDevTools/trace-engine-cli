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
import { getPropertyByPath } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { EventsResult, RawTraceEvent, RawTraceEventItem } from '../types.js';

/**
 * Configuration options for filtering and extracting raw trace events.
 */
export interface ExtractEventsOptions {
  /** Event names to match (exact match). Multiple names match as a union. */
  names?: string[];
  /** Exact trace event category (e.g. 'devtools.timeline', 'v8'). */
  category?: string;
  /** Chromium event phase code (e.g. 'X' for complete, 'I' for instant, 'B'/'E' for begin/end). */
  phase?: string;
  /** Dot-notation property paths to project into selectedFields (e.g. 'args.data.navigationId'). */
  fields?: string[];
  /** Time window in milliseconds (relative or absolute, matching trace bounds). */
  timeRange?: TimeRange;
  /** Maximum number of events to return in the events array. Default: 50. */
  limit?: number;
}

/**
 * Filters and extracts raw trace events matching query criteria.
 *
 * Normalizes event timestamps and durations to milliseconds.
 * Returns the total number of matched events and a capped array of event items.
 */
export function extractEvents(
  loadedTrace: LoadedTrace,
  options?: ExtractEventsOptions,
): EventsResult {
  const { rawEvents } = loadedTrace;
  const names = options?.names && options.names.length > 0 ? new Set(options.names) : null;
  const category = options?.category;
  const phase = options?.phase;
  const timeRange = options?.timeRange;
  const fields = options?.fields && options.fields.length > 0 ? options.fields : null;
  const limit = options?.limit ?? 50;

  const matchedEvents: RawTraceEventItem[] = [];
  let totalMatched = 0;

  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const event = raw as RawTraceEvent;

    const eventName = event.name ?? '';
    if (names && !names.has(eventName)) {
      continue;
    }

    const eventCat = event.cat;
    if (category && eventCat !== category) {
      continue;
    }

    const eventPh = event.ph;
    if (phase && eventPh !== phase) {
      continue;
    }

    const rawTs = event.ts ?? 0;
    const rawDur = event.dur ?? 0;
    const tsMs = microToMilli(rawTs);
    const durMs = microToMilli(rawDur);

    if (timeRange && !isEventInBounds(tsMs, durMs, timeRange)) {
      continue;
    }

    totalMatched++;

    if (matchedEvents.length < limit) {
      const item: RawTraceEventItem = {
        name: eventName,
        tsMs: round(tsMs),
        durMs: event.dur !== undefined ? round(durMs) : undefined,
        cat: eventCat,
        ph: eventPh,
        pid: event.pid,
        tid: event.tid,
        args: event.args,
      };

      if (fields) {
        const selectedFields: Record<string, unknown> = {};
        for (const field of fields) {
          selectedFields[field] = getPropertyByPath(event, field);
        }
        item.selectedFields = selectedFields;
      }

      matchedEvents.push(item);
    }
  }

  return {
    totalMatched,
    returned: matchedEvents.length,
    events: matchedEvents,
  };
}
