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

export interface RawThreadEntry {
  name: string;
  ts: number;
  dur?: number;
  args?: {
    data?: Record<string, unknown>;
  };
}

export interface RawRendererThread {
  name: string;
  entries: RawThreadEntry[];
  tree?: unknown;
  layoutEvents?: RawThreadEntry[];
  recalcStyleEvents?: RawThreadEntry[];
}

export interface RawRendererProcess {
  isOnMainFrame?: boolean;
  url?: string;
  threads: Map<number, RawRendererThread>;
}

export interface RawInsightModel {
  LCPBreakdown?: {
    lcpMs?: number;
    lcpTs?: number;
    subparts?: {
      ttfb?: { range?: number };
      loadDelay?: { range?: number };
      loadDuration?: { range?: number };
      renderDelay?: { range?: number };
    };
    lcpRequest?: { args?: { data?: { url?: string } } };
    lcpEvent?: { args?: { data?: { nodeName?: string } } };
  };
  INPBreakdown?: {
    longestInteractionEvent?: {
      dur: number;
      ts?: number;
      type?: string;
      name?: string;
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
    };
  };
  CLSCulprits?: {
    clusters?: Array<{
      clusterCumulativeScore?: number;
      ts?: number;
      dur?: number;
      clusterWindow?: {
        min?: number;
        range?: number;
      };
      events?: Array<{
        args?: {
          data?: {
            weighted_score_delta?: number;
            impacted_nodes?: Array<{
              node_id?: number;
              tag_name?: string;
              selector?: string;
              debug_name?: string;
              old_rect?: [number, number, number, number];
              new_rect?: [number, number, number, number];
            }>;
          };
        };
      }>;
    }>;
  };
  RenderBlocking?: {
    renderBlockingRequests?: Array<{
      dur?: number;
      args?: {
        data?: {
          url?: string;
          encodedDataLength?: number;
        };
      };
    }>;
  };
  ThirdParties?: {
    entitySummaries?: Array<{
      entity?: { name?: string };
      transferSize?: number;
      mainThreadTime?: number;
    }>;
  };
}

/**
 * Finds the primary main renderer thread (CrRendererMain) in the trace.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic trace data
export function getMainRendererThread(data: any): RawRendererThread | null {
  const processes = data?.Renderer?.processes as Map<number, RawRendererProcess> | undefined;
  if (!processes) return null;

  // 1. Prefer main frame process
  for (const proc of processes.values()) {
    if (proc.isOnMainFrame && proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries?.length > 0) {
          return thread;
        }
      }
    }
  }

  // 2. Fallback to any process with CrRendererMain
  for (const proc of processes.values()) {
    if (proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries?.length > 0) {
          return thread;
        }
      }
    }
  }

  return null;
}

export interface ParsedTraceWithInsights {
  insights?: Map<
    string,
    {
      id?: string;
      model?: RawInsightModel;
      navigation?: { args?: { data?: { navigationId?: string } } };
    }
  >;
}

export interface InsightEntryResult {
  insightSetId: string;
  model: RawInsightModel;
}

/**
 * Finds an insight set entry matching a navigation ID or key.
 */
export function findInsightEntry(
  parsedTrace: ParsedTraceWithInsights,
  navigationId?: string,
): InsightEntryResult | null {
  if (!parsedTrace?.insights || parsedTrace.insights.size === 0) {
    return null;
  }

  if (navigationId) {
    const directMatch = parsedTrace.insights.get(navigationId);
    if (directMatch) {
      const model = ((directMatch as { model?: RawInsightModel }).model ||
        directMatch) as RawInsightModel;
      return { insightSetId: navigationId, model };
    }
    for (const [key, val] of parsedTrace.insights.entries()) {
      const rawVal = val as {
        id?: string;
        model?: RawInsightModel;
        navigation?: { args?: { data?: { navigationId?: string } } };
      };
      if (
        key === navigationId ||
        rawVal?.id === navigationId ||
        rawVal?.navigation?.args?.data?.navigationId === navigationId
      ) {
        const model = (rawVal?.model || val) as RawInsightModel;
        return { insightSetId: key || rawVal?.id || navigationId, model };
      }
    }
    return null;
  }

  for (const [key, val] of parsedTrace.insights.entries()) {
    const rawVal = val as { id?: string; model?: RawInsightModel };
    const model = (rawVal?.model || val) as RawInsightModel;
    return { insightSetId: key || rawVal?.id || '', model };
  }
  return null;
}

/**
 * Retrieves the insight model set from the parsed trace, optionally filtered by navigation ID.
 */
export function getPrimaryInsightSet(
  parsedTrace: ParsedTraceWithInsights,
  navigationId?: string,
): RawInsightModel | null {
  return findInsightEntry(parsedTrace, navigationId)?.model ?? null;
}

/**
 * Traverses an object along a dot-separated property path.
 */
export function getPropertyByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
