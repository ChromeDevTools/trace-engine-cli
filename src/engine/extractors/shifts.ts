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
import { shouldWarnAboutLayoutShiftCapture, UNCONFIRMED_LAYOUT_SHIFT_CAPTURE } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type {
  ShiftClusterItem,
  ShiftCulprit,
  ShiftIndividualEvent,
  ShiftsResult,
} from '../types.js';

export interface ExtractShiftsOptions {
  timeRange?: TimeRange;
  includeEvents?: boolean;
}

export type SyntheticLayoutShiftCluster = NonNullable<
  LoadedTrace['parsedTrace']['data']['LayoutShifts']
>['clusters'][number];
export type SyntheticLayoutShift = SyntheticLayoutShiftCluster['events'][number];
export type TraceImpactedNode = NonNullable<
  NonNullable<SyntheticLayoutShift['args']['data']>['impacted_nodes']
>[number];

export function layoutShiftNodeLabel(node: ShiftCulprit): string {
  return (
    node.selector ||
    node.debugName ||
    node.tagName ||
    (node.nodeId !== undefined ? `Node #${node.nodeId}` : 'Unknown node')
  );
}

function getNodeDetails(node: TraceImpactedNode, shift: SyntheticLayoutShift) {
  return {
    nodeId: node.node_id ?? undefined,
    processId: shift.pid,
    frameId: shift.args.frame || undefined,
    tagName: 'tag_name' in node && typeof node.tag_name === 'string' ? node.tag_name : undefined,
    selector: 'selector' in node && typeof node.selector === 'string' ? node.selector : undefined,
    debugName: node.debug_name,
    oldRect: node.old_rect,
    newRect: node.new_rect,
  };
}

/**
 * Extracts layout shift clusters, scores, and culprit elements.
 */
export function extractShifts(
  loadedTrace: LoadedTrace,
  options?: ExtractShiftsOptions,
  rawClusters?: readonly SyntheticLayoutShiftCluster[],
): ShiftsResult {
  const timeRange = options?.timeRange;
  const sourceClusters = rawClusters ?? loadedTrace.parsedTrace.data.LayoutShifts?.clusters ?? [];

  const clusters: ShiftClusterItem[] = [];

  for (const cluster of sourceClusters) {
    const startMs = microToMilli(cluster.clusterWindow?.min ?? cluster.ts ?? 0);
    const durMs = microToMilli(cluster.clusterWindow?.range ?? cluster.dur ?? 0);
    const score = cluster.clusterCumulativeScore ?? 0;

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const culpritMap = new Map<string | symbol, ShiftCulprit>();
    const individualEvents: ShiftIndividualEvent[] = [];

    for (const ev of cluster.events) {
      const data = ev.args.data;
      const scoreDelta = data?.weighted_score_delta;
      const impactedNodes = (data?.impacted_nodes ?? []).map((node) => getNodeDetails(node, ev));
      for (const node of impactedNodes) {
        const { processId, frameId, nodeId, selector, debugName, tagName } = node;
        // Backend node IDs can repeat across renderers and frames.
        const identity = nodeId ?? (selector || debugName || tagName || undefined);
        const key =
          identity === undefined ? Symbol() : JSON.stringify([processId, frameId, identity]);
        const existing = culpritMap.get(key);
        if (existing) {
          if (scoreDelta !== undefined) {
            existing.scoreDelta = (existing.scoreDelta ?? 0) + scoreDelta;
          }
          existing.newRect = node.newRect;
        } else {
          culpritMap.set(key, { ...node, scoreDelta });
        }
      }

      if (options?.includeEvents) {
        individualEvents.push({
          timestampMs: round(microToMilli(ev.ts)),
          score: round(data?.score ?? scoreDelta ?? 0, 4),
          weightedScoreDelta: scoreDelta !== undefined ? round(scoreDelta, 4) : undefined,
          navigationId: data?.navigationId,
          hadRecentInput: data?.had_recent_input,
          impactedNodes: impactedNodes.length > 0 ? impactedNodes : undefined,
        });
      }
    }

    const clusterNavId = cluster.navigationId || cluster.events[0]?.args.data?.navigationId;

    clusters.push({
      timestampMs: round(startMs),
      durationMs: round(durMs),
      cumulativeScore: round(score, 4),
      navigationId: clusterNavId,
      culprits: [...culpritMap.values()].map((node) => ({
        ...node,
        scoreDelta: node.scoreDelta !== undefined ? round(node.scoreDelta, 4) : undefined,
      })),
      ...(options?.includeEvents ? { events: individualEvents } : {}),
    });
  }

  // Sort by score descending
  clusters.sort((a, b) => b.cumulativeScore - a.cumulativeScore);

  const warnings: string[] = [];
  if (shouldWarnAboutLayoutShiftCapture(loadedTrace)) {
    warnings.push(UNCONFIRMED_LAYOUT_SHIFT_CAPTURE);
  }
  const missingNodeMetadata = clusters.some((cluster) =>
    cluster.culprits.some((node) => !node.tagName && !node.selector && !node.debugName),
  );
  if (missingNodeMetadata) {
    warnings.push(
      'DOM names and selectors were unavailable for some shifted nodes. Backend node IDs and rectangles are shown when recorded.',
    );
  }

  const result: ShiftsResult = { clusters };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}
