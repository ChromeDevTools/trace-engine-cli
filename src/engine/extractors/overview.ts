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
import { microToMilli, milliToMicro, round } from '../../utils/units.js';
import {
  findInsightEntry,
  getRendererThread,
  MISSING_CPU_SAMPLES,
  PAGE_TRACE_CAPTURE_HINT,
  shouldWarnAboutLayoutShiftCapture,
  UNCONFIRMED_LAYOUT_SHIFT_CAPTURE,
} from '../helpers.js';
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
  threadId?: string;
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
  const mainFrameId = data.Meta.mainFrameId;
  // The engine can retain the previous trace's main frame ID and URL when no frame is recorded.
  const hasMainFrame = data.Meta.rendererProcessesByFrame.has(mainFrameId);
  const mainUrl = hasMainFrame ? data.Meta.mainFrameURL || null : null;
  const mainNavs = data.Meta.mainFrameNavigations || [];
  const allNavs = Array.from(data.Meta.navigationsByNavigationId?.values() || []);
  const firstNav = mainNavs[0] || allNavs[0];
  const navigationStartMs = firstNav ? round(microToMilli(firstNav.ts)) : null;

  // 3. Core Web Vitals
  const entry = findInsightEntry(parsedTrace);
  const insightSet = entry?.model;
  const pageMetrics = data.PageLoadMetrics?.metricScoresByFrameId?.get(mainFrameId);

  let fcp: OverviewResult['coreWebVitals']['fcp'] = null;
  let lcp: OverviewResult['coreWebVitals']['lcp'] = null;

  if (pageMetrics) {
    const MetricName = engine.Handlers.ModelHandlers.PageLoadMetrics.MetricName;
    let metrics = entry?.navigation ? pageMetrics.get(entry.navigation) : undefined;
    if (!entry?.navigation) {
      for (const navMetrics of pageMetrics.values()) {
        if (navMetrics.has(MetricName.LCP)) {
          metrics = navMetrics;
          break;
        }
        metrics ??= navMetrics;
      }
    }

    const fcpTiming = metrics?.get(MetricName.FCP)?.timing;
    if (fcpTiming !== undefined) {
      const valueMs = round(microToMilli(fcpTiming));
      fcp = { valueMs, rating: rateFcp(valueMs) };
    }

    const lcpTiming = metrics?.get(MetricName.LCP)?.timing;
    if (lcpTiming !== undefined) {
      const valueMs = round(microToMilli(lcpTiming));
      lcp = { valueMs, rating: rateLcp(valueMs) };
    }
  }

  // Check insights for LCP URL / Element if available
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
  const warnAboutShiftCapture = shouldWarnAboutLayoutShiftCapture(loadedTrace);
  if (layoutShifts && !warnAboutShiftCapture) {
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
  const work = {
    scriptingMs: 0,
    styleMs: 0,
    layoutMs: 0,
    paintMs: 0,
    compositeMs: 0,
    gcMs: 0,
    interruptMs: 0,
    systemMs: 0,
  };

  const mainThread = getRendererThread(data, options?.threadId);

  if (mainThread?.entries && mainThread.entries.length > 0) {
    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(mainThread.entries, {
      textFilter: { accept: () => true },
      // Renderer.entryToNode is built with CPU samples, which can displace overlapping timeline
      // events. Keep timeline attribution independent of whether samples were captured.
      filters: [
        {
          accept: (event) =>
            !engine.Types.Events.isProfileCall(event) &&
            !engine.Types.Events.isPhaseAsync(event.ph),
        },
      ],
      startTime: engine.Types.Timing.Micro(milliToMicro(minMs)),
      endTime: engine.Types.Timing.Micro(milliToMicro(maxMs)),
    });

    const { Name } = engine.Types.Events;
    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      const selfTimeMs = microToMilli(node.selfTime);
      const name = node.event?.name || String(node.id) || '';

      if (
        name === Name.MAJOR_GC ||
        name === Name.MINOR_GC ||
        name === Name.GC ||
        name.toLowerCase().startsWith('v8.gc')
      ) {
        work.gcMs += selfTimeMs;
      } else if (name === Name.RECALC_STYLE) {
        work.styleMs += selfTimeMs;
      } else if (name === Name.LAYOUT || name === Name.INVALIDATE_LAYOUT) {
        work.layoutMs += selfTimeMs;
      } else if (
        name === Name.PRE_PAINT ||
        name === Name.PAINT ||
        name === Name.PAINT_IMAGE ||
        name === Name.RASTER_TASK ||
        name === Name.DECODE_IMAGE ||
        name === Name.UPDATE_LAYER
      ) {
        work.paintMs += selfTimeMs;
      } else if (
        name === Name.UPDATE_LAYER_TREE ||
        name === Name.LAYERIZE ||
        name === Name.COMPOSITE_LAYERS ||
        name === Name.COMMIT
      ) {
        work.compositeMs += selfTimeMs;
      } else if (name === 'V8.InvokeApiInterruptCallbacks') {
        work.interruptMs += selfTimeMs;
      } else if (
        name === Name.EVALUATE_SCRIPT ||
        name === Name.FUNCTION_CALL ||
        name.startsWith(Name.COMPILE) ||
        name === 'v8.callFunction' ||
        name === Name.RUN_MICROTASKS ||
        name === 'v8.run' ||
        name === Name.TIMER_FIRE ||
        name === Name.FIRE_ANIMATION_FRAME ||
        name === Name.EVENT_DISPATCH
      ) {
        work.scriptingMs += selfTimeMs;
      } else {
        work.systemMs += selfTimeMs;
      }
    }
  }

  let activeWork = 0;
  // Round cumulative time so category rounding cannot add or remove time from the total.
  function roundKind(ms: number): number {
    const previous = round(activeWork);
    activeWork += ms;
    return round(round(activeWork) - previous);
  }
  const breakdown = {
    scriptingMs: roundKind(work.scriptingMs),
    styleMs: roundKind(work.styleMs),
    layoutMs: roundKind(work.layoutMs),
    paintMs: roundKind(work.paintMs),
    compositeMs: roundKind(work.compositeMs),
    gcMs: roundKind(work.gcMs),
    interruptMs: roundKind(work.interruptMs),
    systemMs: roundKind(work.systemMs),
    idleMs: round(Math.max(0, durationMs - round(activeWork))),
    totalMs: durationMs,
  };

  // 5. Warnings
  const warnings: string[] = [];
  if (!hasMainFrame) warnings.push(`No main page frame found. ${PAGE_TRACE_CAPTURE_HINT}`);
  if (warnAboutShiftCapture) warnings.push(UNCONFIRMED_LAYOUT_SHIFT_CAPTURE);
  if (mainThread && !mainThread.profileCalls.length) warnings.push(MISSING_CPU_SAMPLES);
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
    threadId: options?.threadId,
    bounds: { minMs, maxMs, durationMs },
    mainUrl,
    navigationStartMs,
    coreWebVitals: { fcp, lcp, cls, inp },
    mainThreadBreakdown: breakdown,
    warnings,
  };
}
