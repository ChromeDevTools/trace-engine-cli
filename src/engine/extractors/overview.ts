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
import { getMainRendererThread, getPrimaryInsightSet } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { CwvRating, OverviewResult } from '../types.js';

function rateFcp(fcpMs: number): CwvRating {
  if (fcpMs <= 1800) return 'good';
  if (fcpMs <= 3000) return 'needs-improvement';
  return 'poor';
}

function rateLcp(lcpMs: number): CwvRating {
  if (lcpMs <= 2500) return 'good';
  if (lcpMs <= 4000) return 'needs-improvement';
  return 'poor';
}

function rateCls(cls: number): CwvRating {
  if (cls <= 0.1) return 'good';
  if (cls <= 0.25) return 'needs-improvement';
  return 'poor';
}

function rateInp(inpMs: number): CwvRating {
  if (inpMs <= 200) return 'good';
  if (inpMs <= 500) return 'needs-improvement';
  return 'poor';
}

export interface ExtractOverviewOptions {
  timeRange?: TimeRange;
}

/**
 * Extracts high-level trace metadata, Core Web Vitals, and main thread category distribution.
 * All duration and timestamp properties are normalized to milliseconds (ms).
 */
export function extractOverview(
  loadedTrace: LoadedTrace,
  options?: ExtractOverviewOptions,
): OverviewResult {
  const { engine, parsedTrace } = loadedTrace;
  const data = parsedTrace.data;
  const timeRange = options?.timeRange;

  // 1. Trace Bounds & Duration
  const traceBounds = data.Meta.traceBounds;
  const minMs = timeRange ? timeRange.startMs : round(microToMilli(traceBounds.min));
  const maxMs = timeRange ? timeRange.endMs : round(microToMilli(traceBounds.max));
  const durationMs = round(maxMs - minMs);

  // 2. Main URL & Navigation Start
  const mainUrl = data.Meta.mainFrameURL || null;
  const mainNavs = data.Meta.mainFrameNavigations || [];
  const allNavs = Array.from(data.Meta.navigationsByNavigationId?.values() || []);
  const firstNav = mainNavs[0] || allNavs[0];
  const navigationStartMs = firstNav ? round(microToMilli(firstNav.ts)) : null;

  // 3. Core Web Vitals
  const mainFrameId = data.Meta.mainFrameId;
  const pageMetrics = data.PageLoadMetrics?.metricScoresByFrameId?.get(mainFrameId);

  let fcp: OverviewResult['coreWebVitals']['fcp'] = null;
  let lcp: OverviewResult['coreWebVitals']['lcp'] = null;

  if (pageMetrics) {
    const MetricName = engine.Handlers.ModelHandlers.PageLoadMetrics.MetricName;
    for (const navMetrics of pageMetrics.values()) {
      const fcpMetric = navMetrics.get(MetricName.FCP);
      if (fcpMetric && fcpMetric.timing !== undefined && !fcp) {
        const valMs = round(microToMilli(fcpMetric.timing));
        fcp = {
          valueMs: valMs,
          rating: rateFcp(valMs),
        };
      }

      const lcpMetric = navMetrics.get(MetricName.LCP);
      if (lcpMetric && lcpMetric.timing !== undefined && !lcp) {
        const valMs = round(microToMilli(lcpMetric.timing));
        lcp = {
          valueMs: valMs,
          rating: rateLcp(valMs),
        };
      }
    }
  }

  // Check insights for LCP URL / Element if available
  const insightSet = getPrimaryInsightSet(parsedTrace);

  if (insightSet?.LCPBreakdown) {
    const lcpInsight = insightSet.LCPBreakdown;
    if (lcpInsight.lcpMs !== undefined && !lcp) {
      const valMs = round(lcpInsight.lcpMs);
      lcp = {
        valueMs: valMs,
        rating: rateLcp(valMs),
      };
    }
    if (lcp) {
      if (lcpInsight.lcpRequest?.args?.data?.url) {
        lcp.url = lcpInsight.lcpRequest.args.data.url;
      }
      if (lcpInsight.lcpEvent?.args?.data?.nodeName) {
        lcp.element = lcpInsight.lcpEvent.args.data.nodeName;
      }
    }
  }

  // CLS
  let cls: OverviewResult['coreWebVitals']['cls'] = null;
  const layoutShifts = data.LayoutShifts;
  if (layoutShifts) {
    const score = layoutShifts.sessionMaxScore ?? 0;
    const worstCluster = layoutShifts.clusters?.[0]?.clusterCumulativeScore;
    cls = {
      value: round(score, 4),
      rating: rateCls(score),
      worstClusterScore: worstCluster !== undefined ? round(worstCluster, 4) : undefined,
    };
  }

  // INP
  let inp: OverviewResult['coreWebVitals']['inp'] = null;
  const userInteractions = data.UserInteractions;
  const longestInteraction = userInteractions?.longestInteractionEvent;
  if (longestInteraction) {
    const durMs = round(microToMilli(longestInteraction.dur));
    inp = {
      valueMs: durMs,
      rating: rateInp(durMs),
      interactionType: longestInteraction.type,
    };
  } else if (insightSet?.INPBreakdown?.longestInteractionEvent) {
    const ev = insightSet.INPBreakdown.longestInteractionEvent;
    const durMs = round(microToMilli(ev.dur));
    inp = {
      valueMs: durMs,
      rating: rateInp(durMs),
      interactionType: ev.type,
    };
  }

  // 4. Main Thread Breakdown (Derived from TraceTree self-times to eliminate double-counting)
  const breakdown = {
    scriptingMs: 0,
    layoutMs: 0,
    renderingMs: 0,
    gcMs: 0,
    systemMs: 0,
    idleMs: 0,
    totalMs: 0,
  };

  const mainThread = getMainRendererThread(data);

  if (mainThread?.entries && mainThread.entries.length > 0) {
    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(mainThread.entries, {
      textFilter: { accept: () => true },
      filters: [],
      startTime: engine.Types.Timing.Milli(minMs),
      endTime: engine.Types.Timing.Milli(maxMs),
    });

    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      const name = node.event?.name || String(node.id) || '';

      if (
        name === 'MajorGC' ||
        name === 'MinorGC' ||
        name === 'GCEvent' ||
        name.startsWith('v8.gc')
      ) {
        breakdown.gcMs += node.selfTime;
      } else if (name === 'Layout' || name === 'UpdateLayoutTree' || name === 'InvalidateLayout') {
        breakdown.layoutMs += node.selfTime;
      } else if (
        name === 'UpdateLayerTree' ||
        name === 'Paint' ||
        name === 'CompositeLayers' ||
        name === 'RasterTask' ||
        name === 'DecodeImage'
      ) {
        breakdown.renderingMs += node.selfTime;
      } else if (
        name.startsWith('f:') ||
        name === 'EvaluateScript' ||
        name === 'FunctionCall' ||
        name === 'v8.compile' ||
        name === 'v8.run' ||
        name === 'TimerFire' ||
        name === 'FireAnimationFrame' ||
        name === 'EventDispatch'
      ) {
        breakdown.scriptingMs += node.selfTime;
      } else {
        breakdown.systemMs += node.selfTime;
      }
    }
  }

  const activeWork =
    breakdown.scriptingMs +
    breakdown.layoutMs +
    breakdown.renderingMs +
    breakdown.gcMs +
    breakdown.systemMs;

  breakdown.idleMs = round(Math.max(0, durationMs - activeWork));
  breakdown.scriptingMs = round(breakdown.scriptingMs);
  breakdown.layoutMs = round(breakdown.layoutMs);
  breakdown.renderingMs = round(breakdown.renderingMs);
  breakdown.gcMs = round(breakdown.gcMs);
  breakdown.systemMs = round(breakdown.systemMs);
  breakdown.totalMs = durationMs;

  // 5. Warnings
  const warnings: string[] = [];
  if (fcp && fcp.rating === 'poor') {
    warnings.push(`Poor First Contentful Paint: ${fcp.valueMs}ms (threshold: 1800ms)`);
  }
  if (lcp && lcp.rating === 'poor') {
    warnings.push(`Poor Largest Contentful Paint: ${lcp.valueMs}ms (threshold: 2500ms)`);
  }
  if (cls && cls.rating === 'poor') {
    warnings.push(`Poor Cumulative Layout Shift: ${cls.value} (threshold: 0.1)`);
  }
  if (inp && inp.rating === 'poor') {
    warnings.push(`Poor Interaction to Next Paint: ${inp.valueMs}ms (threshold: 200ms)`);
  }
  if ((insightSet?.RenderBlocking?.renderBlockingRequests?.length ?? 0) > 0) {
    warnings.push(
      `${insightSet?.RenderBlocking?.renderBlockingRequests?.length} render-blocking resource(s) detected.`,
    );
  }

  return {
    bounds: { minMs, maxMs, durationMs },
    mainUrl,
    navigationStartMs,
    coreWebVitals: { fcp, lcp, cls, inp },
    mainThreadBreakdown: breakdown,
    warnings,
  };
}
