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

import type { ParsedTrace } from './loader.js';

type MapValue<T> = T extends Map<unknown, infer V> ? V : never;
type RendererProcess = MapValue<NonNullable<ParsedTrace['data']['Renderer']>['processes']>;

export type RendererThread = MapValue<RendererProcess['threads']>;
export type InsightSet = MapValue<NonNullable<ParsedTrace['insights']>>;
export type InsightModels = InsightSet['model'];

/**
 * Finds the primary main renderer thread (CrRendererMain) in the trace.
 */
export function getMainRendererThread(data: ParsedTrace['data']): RendererThread | null {
  const processes = data.Renderer?.processes;
  if (!processes) return null;

  // 1. Prefer main frame process
  for (const proc of processes.values()) {
    if (proc.isOnMainFrame && proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries.length > 0) {
          return thread;
        }
      }
    }
  }

  // 2. Fallback to any process with CrRendererMain
  for (const proc of processes.values()) {
    if (proc.threads) {
      for (const thread of proc.threads.values()) {
        if (thread.name === 'CrRendererMain' && thread.entries.length > 0) {
          return thread;
        }
      }
    }
  }

  return null;
}

export interface InsightEntryResult {
  insightSetId: string;
  model: InsightModels;
}

/**
 * Finds an insight set entry matching a navigation ID or key.
 */
export function findInsightEntry(
  parsedTrace: ParsedTrace,
  navigationId?: string,
): InsightEntryResult | null {
  if (!parsedTrace.insights || parsedTrace.insights.size === 0) {
    return null;
  }

  if (navigationId) {
    const directMatch = parsedTrace.insights.get(navigationId);
    if (directMatch) {
      return { insightSetId: navigationId, model: directMatch.model };
    }
    for (const [key, insightSet] of parsedTrace.insights.entries()) {
      const navArgs = insightSet.navigation?.args;
      const navEventId =
        navArgs && 'data' in navArgs && navArgs.data ? navArgs.data.navigationId : undefined;
      if (key === navigationId || insightSet.id === navigationId || navEventId === navigationId) {
        return { insightSetId: key || insightSet.id || navigationId, model: insightSet.model };
      }
    }
    return null;
  }

  for (const [key, insightSet] of parsedTrace.insights.entries()) {
    return { insightSetId: key || insightSet.id || '', model: insightSet.model };
  }
  return null;
}

/**
 * Retrieves the insight model set from the parsed trace, optionally filtered by navigation ID.
 */
export function getPrimaryInsightSet(
  parsedTrace: ParsedTrace,
  navigationId?: string,
): InsightModels | null {
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
