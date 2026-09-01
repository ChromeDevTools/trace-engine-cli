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
import { getPrimaryInsightSet } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type {
  ClsCulpritInsight,
  InpBreakdownInsight,
  InsightsResult,
  LcpBreakdownInsight,
  RenderBlockingInsight,
  ThirdPartyEntityInsight,
} from '../types.js';

/**
 * Configuration options for diagnostic insights extraction.
 */
export interface ExtractInsightsOptions {
  /** Filter insights by diagnostic category. Network requests are handled by extractNetwork. */
  category?: 'lcp' | 'inp' | 'cls' | 'render-blocking' | 'third-parties';
  /** Target navigation ID or InsightSet ID. Defaults to the first InsightSet in the trace. */
  navigationId?: string;
}

/**
 * Extracts diagnostic insight cards for Web Vitals (LCP, INP, CLS, render blocking, 3rd party).
 */
export function extractInsights(
  loadedTrace: LoadedTrace,
  options?: ExtractInsightsOptions,
): InsightsResult {
  const { parsedTrace } = loadedTrace;
  const result: InsightsResult = {
    navigationId: options?.navigationId,
  };
  const warnings: string[] = [];

  const insightSet = getPrimaryInsightSet(parsedTrace, options?.navigationId);
  if (options?.navigationId && !insightSet) {
    warnings.push(`No insights found for navigation ID: ${options.navigationId}`);
  }
  const category = options?.category;
  const shouldInclude = (cat: string) => !category || category === cat;
  const allowGlobalFallback = !options?.navigationId;

  // 1. LCP Breakdown
  if (shouldInclude('lcp') && insightSet?.LCPBreakdown) {
    const l = insightSet.LCPBreakdown;
    const subparts = l.subparts;
    const lcpInsight: LcpBreakdownInsight = {
      totalLcpMs: round(l.lcpMs ?? (l.lcpTs ? microToMilli(l.lcpTs) : 0)),
      ttfbMs: subparts?.ttfb?.range ? round(microToMilli(subparts.ttfb.range)) : 0,
      loadDelayMs: subparts?.loadDelay?.range ? round(microToMilli(subparts.loadDelay.range)) : 0,
      loadDurationMs: subparts?.loadDuration?.range
        ? round(microToMilli(subparts.loadDuration.range))
        : 0,
      renderDelayMs: subparts?.renderDelay?.range
        ? round(microToMilli(subparts.renderDelay.range))
        : 0,
      lcpElement: l.lcpEvent?.args?.data?.nodeName,
      lcpUrl: l.lcpRequest?.args?.data?.url,
    };
    result.lcpBreakdown = lcpInsight;

    if (lcpInsight.renderDelayMs > 1000) {
      warnings.push(`High LCP element render delay: ${lcpInsight.renderDelayMs}ms.`);
    }
    if (lcpInsight.loadDelayMs > 1000) {
      warnings.push(`High LCP resource load delay: ${lcpInsight.loadDelayMs}ms.`);
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
      const inpInsight: InpBreakdownInsight = {
        totalDurationMs: round(microToMilli(longestEvent.dur)),
        inputDelayMs: round(microToMilli(longestEvent.inputDelay ?? 0)),
        processingDurationMs: round(
          microToMilli(longestEvent.mainThreadHandling ?? longestEvent.processingDuration ?? 0),
        ),
        presentationDelayMs: round(microToMilli(longestEvent.presentationDelay ?? 0)),
        eventType: longestEvent.type || longestEvent.name || 'unknown',
        target: longestEvent.args?.data?.nodeName,
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
    const clsList: ClsCulpritInsight[] = [];
    const clsModel = insightSet?.CLSCulprits;

    if (clsModel?.clusters && clsModel.clusters.length > 0) {
      for (const cluster of clsModel.clusters) {
        const score = cluster.clusterCumulativeScore ?? 0;
        const tsMs = round(microToMilli(cluster.clusterWindow?.min ?? cluster.ts ?? 0));
        const culpritNodes: string[] = [];
        if (cluster.events) {
          for (const ev of cluster.events) {
            const nodes = ev.args?.data?.impacted_nodes || [];
            for (const n of nodes) {
              if (n.node_id !== undefined) culpritNodes.push(`Node #${n.node_id}`);
            }
          }
        }
        clsList.push({
          score: round(score, 4),
          timestampMs: tsMs,
          culpritNodes,
        });
      }
    } else if (allowGlobalFallback && parsedTrace.data.LayoutShifts?.clusters) {
      for (const cluster of parsedTrace.data.LayoutShifts.clusters) {
        clsList.push({
          score: round(cluster.clusterCumulativeScore ?? 0, 4),
          timestampMs: round(microToMilli(cluster.clusterWindow?.min ?? 0)),
          culpritNodes: [],
        });
      }
    }

    if (clsList.length > 0) {
      result.clsCulprits = clsList;
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
    const summaries = insightSet.ThirdParties.entitySummaries || [];
    for (const s of summaries) {
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
