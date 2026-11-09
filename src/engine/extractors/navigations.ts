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

import { microToMilli, round } from '../../utils/units.js';
import { findInsightEntry } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { NavigationItem, NavigationsResult } from '../types.js';

export type NavigationStart = NonNullable<
  LoadedTrace['parsedTrace']['data']['Meta']
>['mainFrameNavigations'][number];

function buildNavigationItem(
  navId: string,
  navEvent: NavigationStart | undefined,
  finalUrls: Map<string, string> | undefined,
  isMainFrame: boolean,
  parsedTrace: LoadedTrace['parsedTrace'],
): NavigationItem {
  const url =
    finalUrls?.get(navId) ||
    navEvent?.args.data?.documentLoaderURL ||
    navEvent?.args.data?.url ||
    '';
  const frameId = navEvent?.args.frame;
  const tsMs = round(microToMilli(navEvent?.ts ?? 0));
  const insightEntry = findInsightEntry(parsedTrace, navId);

  return {
    navigationId: navId,
    insightSetId: insightEntry?.insightSetId,
    frameId,
    url,
    timestampMs: tsMs,
    isMainFrame,
    hasInsights: Boolean(insightEntry),
  };
}

/**
 * Extracts navigation events and associated insight mappings from trace metadata.
 *
 * Discovers navigations from Meta.navigationsByNavigationId and Meta.mainFrameNavigations,
 * maps each navigation to its corresponding InsightSet ID (e.g. 'NAVIGATION_0'),
 * and determines whether the navigation belongs to the primary main frame.
 */
export function extractNavigations(loadedTrace: LoadedTrace): NavigationsResult {
  const { parsedTrace } = loadedTrace;
  const meta = parsedTrace.data.Meta;
  const navigationsMap = meta?.navigationsByNavigationId;
  const finalUrls = meta?.finalDisplayUrlByNavigationId;
  const mainFrameId = meta?.mainFrameId;
  const mainFrameNavs = meta?.mainFrameNavigations;
  const insightsMap = parsedTrace.insights;

  const insightSetIds: string[] = insightsMap ? Array.from(insightsMap.keys()) : [];
  const navigations: NavigationItem[] = [];
  const seenIds = new Set<string>();

  const mainFrameNavIdSet = new Set(
    (mainFrameNavs || [])
      .map((m: NavigationStart) => m.args.data?.navigationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  if (navigationsMap && navigationsMap.size > 0) {
    for (const [navId, navEvent] of navigationsMap.entries()) {
      seenIds.add(navId);
      const frameId = navEvent.args.frame;
      const isMainFrame = Boolean(
        navEvent.args.data?.isOutermostMainFrame ??
          navEvent.args.data?.isLoadingMainFrame ??
          mainFrameNavIdSet.has(navId) ??
          (frameId && frameId === mainFrameId),
      );

      navigations.push(buildNavigationItem(navId, navEvent, finalUrls, isMainFrame, parsedTrace));
    }
  }

  if (mainFrameNavs && mainFrameNavs.length > 0) {
    for (const navEvent of mainFrameNavs) {
      const navId = navEvent.args.data?.navigationId;
      if (navId && !seenIds.has(navId)) {
        seenIds.add(navId);
        navigations.push(buildNavigationItem(navId, navEvent, finalUrls, true, parsedTrace));
      }
    }
  }

  navigations.sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    total: navigations.length,
    navigations,
    insightSetIds,
  };
}
