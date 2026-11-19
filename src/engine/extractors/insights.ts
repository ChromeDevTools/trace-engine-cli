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
import { findInsightEntry } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type {
  InpBreakdownInsight,
  InsightsResult,
  LcpBreakdownInsight,
  RenderBlockingInsight,
  ThirdPartyEntityInsight,
} from '../types.js';
import { extractShifts, layoutShiftNodeLabel } from './shifts.js';

/**
 * Configuration options for diagnostic insights extraction.
 */
export interface ExtractInsightsOptions {
  /** Filter insights by diagnostic category. Network requests are handled by extractNetwork. */
  category?: 'lcp' | 'inp' | 'cls' | 'render-blocking' | 'third-parties';
  /** Target navigation ID or InsightSet ID. Defaults to the main-frame load with LCP. */
  navigationId?: string;
  timeRange?: TimeRange;
}

/**
 * Extracts diagnostic insight cards for Web Vitals (LCP, INP, CLS, render blocking, 3rd party).
 */
export function extractInsights(
  loadedTrace: LoadedTrace,
  options?: ExtractInsightsOptions,
): InsightsResult {
  const { parsedTrace, engine } = loadedTrace;
  const entry = findInsightEntry(parsedTrace, options?.navigationId, options?.timeRange);
  const insightSet = entry?.model;
  const result: InsightsResult = {
    navigationId: entry?.navigationId ?? options?.navigationId,
    insightSetId: entry?.insightSetId,
  };
  const warnings: string[] = [];

  if (options?.navigationId && !entry) {
    const rangeNote = options.timeRange ? ' in the selected time range' : '';
    return {
      ...result,
      warnings: [`No insights found for navigation ID: ${options.navigationId}${rangeNote}`],
    };
  }

  if (options?.timeRange && !entry) {
    warnings.push('No navigation insights overlap the selected time range.');
  }
  const category = options?.category;
  const shouldInclude = (cat: string) => !category || category === cat;
  const allowGlobalFallback = !options?.navigationId && !options?.timeRange;

  // 1. LCP Breakdown
  if (shouldInclude('lcp') && entry) {
    const lcp = insightSet?.LCPBreakdown;
    const subparts = lcp?.subparts;
    if (lcp?.lcpMs !== undefined) {
      const toMs = (range?: number) => (range === undefined ? null : round(microToMilli(range)));
      const lcpInsight: LcpBreakdownInsight = {
        totalLcpMs: round(lcp.lcpMs),
        ttfbMs: toMs(subparts?.ttfb?.range),
        loadDelayMs: toMs(subparts?.loadDelay?.range),
        loadDurationMs: toMs(subparts?.loadDuration?.range),
        renderDelayMs: toMs(subparts?.renderDelay?.range),
        lcpElement: lcp.lcpEvent?.args?.data?.nodeName,
        lcpUrl: lcp.lcpRequest?.args?.data?.url,
      };
      result.lcpBreakdown = lcpInsight;

      if (!subparts) {
        warnings.push(
          'LCP was measured, but the trace has no timing breakdown for this navigation.',
        );
      }
      if ((lcpInsight.renderDelayMs ?? 0) > 1000) {
        warnings.push(`High LCP element render delay: ${lcpInsight.renderDelayMs}ms.`);
      }
      if ((lcpInsight.loadDelayMs ?? 0) > 1000) {
        warnings.push(`High LCP resource load delay: ${lcpInsight.loadDelayMs}ms.`);
      }
    } else if (category === 'lcp') {
      warnings.push('No LCP was measured for this navigation.');
    }
  }

  // 2. INP Breakdown
  if (
    shouldInclude('inp') &&
    (insightSet?.INPBreakdown || (allowGlobalFallback && parsedTrace.data.UserInteractions))
  ) {
    const inpModel = insightSet?.INPBreakdown;
    const longestEvent =
      inpModel?.longestInteractionEvent ||
      (allowGlobalFallback
        ? parsedTrace.data.UserInteractions?.longestInteractionEvent
        : undefined);

    if (longestEvent) {
      // Synthetic interaction events store their target node name inside the begin event payload.
      const beginData = longestEvent.args?.data?.beginEvent?.args?.data;
      const target =
        beginData && 'nodeName' in beginData && typeof beginData.nodeName === 'string'
          ? beginData.nodeName
          : undefined;

      const inpInsight: InpBreakdownInsight = {
        totalDurationMs: round(microToMilli(longestEvent.dur)),
        inputDelayMs: round(microToMilli(longestEvent.inputDelay ?? 0)),
        processingDurationMs: round(microToMilli(longestEvent.mainThreadHandling ?? 0)),
        presentationDelayMs: round(microToMilli(longestEvent.presentationDelay ?? 0)),
        eventType: longestEvent.type || 'unknown',
        target,
      };
      result.inpBreakdown = inpInsight;

      if (inpInsight.totalDurationMs > 200) {
        warnings.push(
          `Longest interaction (${inpInsight.eventType}) exceeded 200ms threshold: ${inpInsight.totalDurationMs}ms.`,
        );
      }
    }
  }

  // 3. CLS Culprits
  if (shouldInclude('cls')) {
    const layoutShifts = parsedTrace.data.LayoutShifts?.clusters ?? [];
    const navigationId = entry?.navigationId ?? engine.Types.Events.NO_NAVIGATION;
    const selected = options?.navigationId
      ? insightSet?.CLSCulprits?.clusters?.length
        ? insightSet.CLSCulprits.clusters
        : layoutShifts.filter((cluster) => cluster.navigationId === navigationId)
      : layoutShifts;
    const shifts = extractShifts(loadedTrace, { timeRange: options?.timeRange }, selected);
    if (shifts.warnings) warnings.push(...shifts.warnings);
    if (shifts.clusters.length > 0) {
      result.clsCulprits = shifts.clusters.map((cluster) => ({
        score: cluster.cumulativeScore,
        timestampMs: cluster.timestampMs,
        culpritNodes: cluster.culprits.map(layoutShiftNodeLabel),
      }));
    }
  }

  // 4. Render Blocking Resources
  if (shouldInclude('render-blocking') && insightSet?.RenderBlocking) {
    const blocking: RenderBlockingInsight[] = [];
    const reqs = insightSet.RenderBlocking.renderBlockingRequests || [];
    for (const req of reqs) {
      blocking.push({
        url: req.args?.data?.url || '',
        durationMs: round(microToMilli(req.dur ?? 0)),
        transferSizeBytes: req.args?.data?.encodedDataLength ?? 0,
      });
    }
    if (blocking.length > 0) {
      result.renderBlocking = blocking;
      warnings.push(`${blocking.length} render-blocking requests found.`);
    }
  }

  // 5. Third Parties
  if (shouldInclude('third-parties') && insightSet?.ThirdParties) {
    const thirdParties: ThirdPartyEntityInsight[] = [];
    const { entitySummaries: summaries, firstPartyEntity } = insightSet.ThirdParties;
    for (const s of summaries) {
      if (s.entity === firstPartyEntity) continue;
      thirdParties.push({
        entityName: s.entity?.name || 'Unknown',
        transferSizeBytes: s.transferSize ?? 0,
        mainThreadTimeMs: round(s.mainThreadTime ?? 0),
      });
    }
    if (thirdParties.length > 0) {
      result.thirdParties = thirdParties;
    }
  }

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}
