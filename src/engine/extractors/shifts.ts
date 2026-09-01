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
import { getPrimaryInsightSet } from '../helpers.js';
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

interface RawImpactedNode {
  node_id?: number;
  tag_name?: string;
  selector?: string;
  debug_name?: string;
  old_rect?: [number, number, number, number];
  new_rect?: [number, number, number, number];
}

interface RawShiftEvent {
  ts?: number;
  args?: {
    data?: {
      score?: number;
      weighted_score_delta?: number;
      had_recent_input?: boolean;
      navigationId?: string;
      impacted_nodes?: RawImpactedNode[];
    };
  };
}

interface RawLayoutShiftCluster {
  clusterCumulativeScore?: number;
  ts?: number;
  dur?: number;
  navigationId?: string;
  clusterWindow?: {
    min?: number;
    range?: number;
  };
  events?: RawShiftEvent[];
}

/**
 * Extracts layout shift clusters, scores, and culprit elements.
 */
export function extractShifts(
  loadedTrace: LoadedTrace,
  options?: ExtractShiftsOptions,
): ShiftsResult {
  const { parsedTrace } = loadedTrace;
  const timeRange = options?.timeRange;
  const rawClusters = (parsedTrace.data.LayoutShifts?.clusters || []) as RawLayoutShiftCluster[];

  const clusters: ShiftClusterItem[] = [];

  for (const cluster of rawClusters) {
    const startMs = microToMilli(cluster.clusterWindow?.min ?? cluster.ts ?? 0);
    const durMs = microToMilli(cluster.clusterWindow?.range ?? cluster.dur ?? 0);
    const score = cluster.clusterCumulativeScore ?? 0;

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const culpritMap = new Map<string, ShiftCulprit>();
    const individualEvents: ShiftIndividualEvent[] = [];

    if (cluster.events) {
      for (const ev of cluster.events) {
        const scoreDelta = ev.args?.data?.weighted_score_delta;
        const nodes = ev.args?.data?.impacted_nodes || [];
        for (const n of nodes) {
          const key =
            n.selector ||
            (n.node_id ? `node:${n.node_id}` : n.debug_name || n.tag_name || 'unknown');
          const existing = culpritMap.get(key);
          if (existing) {
            if (scoreDelta !== undefined) {
              existing.scoreDelta = round((existing.scoreDelta ?? 0) + scoreDelta, 4);
            }
          } else {
            culpritMap.set(key, {
              nodeId: n.node_id,
              tagName: n.tag_name,
              selector: n.selector || (n.node_id ? `Node #${n.node_id}` : undefined),
              debugName: n.debug_name,
              scoreDelta: scoreDelta !== undefined ? round(scoreDelta, 4) : undefined,
            });
          }
        }

        if (options?.includeEvents) {
          const evTsMs = microToMilli(ev.ts ?? 0);
          const evScore = ev.args?.data?.score ?? ev.args?.data?.weighted_score_delta ?? 0;
          const evWeighted = ev.args?.data?.weighted_score_delta;
          const evNavId = ev.args?.data?.navigationId;
          const hadRecentInput = ev.args?.data?.had_recent_input;
          const impactedNodes = nodes.map((node) => ({
            nodeId: node.node_id,
            tagName: node.tag_name,
            selector: node.selector,
            debugName: node.debug_name,
            oldRect: node.old_rect,
            newRect: node.new_rect,
          }));

          individualEvents.push({
            timestampMs: round(evTsMs),
            score: round(evScore, 4),
            weightedScoreDelta: evWeighted !== undefined ? round(evWeighted, 4) : undefined,
            navigationId: evNavId,
            hadRecentInput,
            impactedNodes: impactedNodes.length > 0 ? impactedNodes : undefined,
          });
        }
      }
    }

    const clusterNavId =
      cluster.navigationId ||
      (cluster.events ? cluster.events[0]?.args?.data?.navigationId : undefined);

    clusters.push({
      timestampMs: round(startMs),
      durationMs: round(durMs),
      cumulativeScore: round(score, 4),
      navigationId: clusterNavId,
      culprits: Array.from(culpritMap.values()),
      ...(options?.includeEvents ? { events: individualEvents } : {}),
    });
  }

  // If no clusters in handler, check insights
  if (clusters.length === 0) {
    const insightSet = getPrimaryInsightSet(parsedTrace);
    const clsModel = insightSet?.CLSCulprits;
    if (clsModel?.clusters && clsModel.clusters.length > 0) {
      for (const c of clsModel.clusters) {
        const startMs = microToMilli(c.clusterWindow?.min ?? 0);
        const durMs = microToMilli(c.clusterWindow?.range ?? 0);
        const score = c.clusterCumulativeScore ?? 0;
        if (isEventInBounds(startMs, durMs, timeRange)) {
          clusters.push({
            timestampMs: round(startMs),
            durationMs: round(durMs),
            cumulativeScore: round(score, 4),
            culprits: [],
          });
        }
      }
    }
  }

  // Sort by score descending
  clusters.sort((a, b) => b.cumulativeScore - a.cumulativeScore);

  return {
    clusters,
  };
}
