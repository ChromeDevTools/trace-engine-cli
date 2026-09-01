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
import type { LoadedTrace } from '../loader.js';
import type { InteractionItem, InteractionsResult } from '../types.js';

export interface ExtractInteractionsOptions {
  timeRange?: TimeRange;
}

interface RawInteractionEvent {
  ts: number;
  dur?: number;
  type?: string;
  name?: string;
  interactionId?: number;
  inputDelay?: number;
  mainThreadHandling?: number;
  processingDuration?: number;
  presentationDelay?: number;
  args?: {
    data?: {
      nodeName?: string;
      beginEvent?: {
        args?: {
          data?: {
            nodeName?: string;
          };
        };
      };
    };
  };
}

export function extractInteractions(
  loadedTrace: LoadedTrace,
  options?: ExtractInteractionsOptions,
): InteractionsResult {
  const { parsedTrace } = loadedTrace;
  const timeRange = options?.timeRange;

  const rawEvents = (parsedTrace.data.UserInteractions?.interactionEventsWithNoNesting ||
    parsedTrace.data.UserInteractions?.interactionEvents ||
    []) as RawInteractionEvent[];

  const interactions: InteractionItem[] = [];

  for (const ev of rawEvents) {
    const startMs = microToMilli(ev.ts);
    const durMs = microToMilli(ev.dur ?? 0);

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const inputDelayMs = microToMilli(ev.inputDelay ?? 0);
    const processingMs = microToMilli(ev.mainThreadHandling ?? ev.processingDuration ?? 0);
    const presentationDelayMs = microToMilli(ev.presentationDelay ?? 0);

    let targetElement: string | undefined;
    if (ev.args?.data?.nodeName) {
      targetElement = ev.args.data.nodeName;
    } else if (ev.args?.data?.beginEvent?.args?.data?.nodeName) {
      targetElement = ev.args.data.beginEvent.args.data.nodeName;
    }

    interactions.push({
      eventType: ev.type || ev.name || 'interaction',
      startTimeMs: round(startMs),
      durationMs: round(durMs),
      inputDelayMs: round(inputDelayMs),
      processingDurationMs: round(processingMs),
      presentationDelayMs: round(presentationDelayMs),
      targetElement,
      interactionId: ev.interactionId,
    });
  }

  // Sort by duration descending
  interactions.sort((a, b) => b.durationMs - a.durationMs);

  return {
    interactions,
  };
}
