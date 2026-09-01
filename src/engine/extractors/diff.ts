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
import { round } from '../../utils/units.js';
import { getMainRendererThread } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { DiffEntryItem, DiffResult } from '../types.js';

export interface ExtractDiffOptions {
  windowA: TimeRange;
  windowB: TimeRange;
  top?: number;
}

interface FnStats {
  name: string;
  url?: string;
  selfTimeMs: number;
}

/**
 * Compares CPU activity between two time windows within a single trace.
 */
export function extractDiff(loadedTrace: LoadedTrace, options: ExtractDiffOptions): DiffResult {
  const { engine, parsedTrace } = loadedTrace;
  const { windowA, windowB } = options;
  const topCount = options.top ?? 20;

  const result: DiffResult = {
    windowA: {
      startMs: windowA.startMs,
      endMs: windowA.endMs,
      durationMs: round(windowA.endMs - windowA.startMs),
    },
    windowB: {
      startMs: windowB.startMs,
      endMs: windowB.endMs,
      durationMs: round(windowB.endMs - windowB.startMs),
    },
    entries: [],
  };

  const mainThread = getMainRendererThread(parsedTrace.data);
  if (!mainThread?.entries?.length) {
    return result;
  }

  const entriesParam = mainThread.entries as unknown as ConstructorParameters<
    typeof engine.Extras.TraceTree.BottomUpRootNode
  >[0];

  function profileWindow(range: TimeRange): {
    map: Map<string, FnStats>;
    totalActive: number;
  } {
    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(entriesParam, {
      textFilter: { accept: () => true },
      filters: [],
      startTime: engine.Types.Timing.Milli(range.startMs),
      endTime: engine.Types.Timing.Milli(range.endMs),
    });

    const map = new Map<string, FnStats>();
    let totalActive = 0;

    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      // biome-ignore lint/suspicious/noExplicitAny: generic trace event
      const frame = engine.Extras.TraceTree.eventStackFrame(node.event as any);
      const fnName = frame?.functionName || node.event?.name || String(node.id) || 'Unknown';

      if (fnName === '(root)' || fnName === '(idle)') continue;

      totalActive += node.selfTime;
      const existing = map.get(fnName);
      if (existing) {
        existing.selfTimeMs += node.selfTime;
      } else {
        map.set(fnName, {
          name: fnName,
          url: frame?.url,
          selfTimeMs: node.selfTime,
        });
      }
    }

    return { map, totalActive };
  }

  const profA = profileWindow(windowA);
  const profB = profileWindow(windowB);

  const allNames = new Set<string>([...profA.map.keys(), ...profB.map.keys()]);

  const diffs: DiffEntryItem[] = [];

  for (const name of allNames) {
    const a = profA.map.get(name);
    const b = profB.map.get(name);

    const msA = a ? round(a.selfTimeMs) : 0;
    const msB = b ? round(b.selfTimeMs) : 0;
    const pctA =
      profA.totalActive > 0 && a ? round((a.selfTimeMs / profA.totalActive) * 100, 1) : 0;
    const pctB =
      profB.totalActive > 0 && b ? round((b.selfTimeMs / profB.totalActive) * 100, 1) : 0;
    const deltaPct = round(pctB - pctA, 1);

    diffs.push({
      functionName: name,
      url: b?.url || a?.url,
      selfTimeMsA: msA,
      selfTimePctA: pctA,
      selfTimeMsB: msB,
      selfTimePctB: pctB,
      deltaPct,
    });
  }

  // Sort by greatest absolute percentage shift
  diffs.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct));

  result.entries = diffs.slice(0, topCount);
  return result;
}
