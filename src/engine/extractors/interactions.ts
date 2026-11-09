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

export type SyntheticInteractionPair = NonNullable<
  NonNullable<
    LoadedTrace['parsedTrace']['data']['UserInteractions']
  >['interactionEventsWithNoNesting']
>[number];

export interface ExtractInteractionsOptions {
  timeRange?: TimeRange;
}

export function extractInteractions(
  loadedTrace: LoadedTrace,
  options?: ExtractInteractionsOptions,
): InteractionsResult {
  const { parsedTrace } = loadedTrace;
  const timeRange = options?.timeRange;

  const rawEvents: readonly SyntheticInteractionPair[] =
    parsedTrace.data.UserInteractions?.interactionEventsWithNoNesting ||
    parsedTrace.data.UserInteractions?.interactionEvents ||
    [];

  const interactions: InteractionItem[] = [];

  for (const ev of rawEvents) {
    const startMs = microToMilli(ev.ts);
    const durMs = microToMilli(ev.dur);

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const inputDelayMs = microToMilli(ev.inputDelay);
    const processingMs = microToMilli(ev.mainThreadHandling);
    const presentationDelayMs = microToMilli(ev.presentationDelay);

    // Synthetic interaction events store their target node name inside the begin event payload.
    const beginData = ev.args.data.beginEvent.args.data;
    const targetElement =
      beginData && 'nodeName' in beginData && typeof beginData.nodeName === 'string'
        ? beginData.nodeName
        : undefined;

    interactions.push({
      eventType: ev.type || 'interaction',
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
