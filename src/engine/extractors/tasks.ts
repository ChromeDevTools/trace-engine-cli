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
import { microToMilli, milliToMicro, round } from '../../utils/units.js';
import { getRendererThread, MISSING_CPU_SAMPLES, rendererCpuFilter } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { TaskItem, TasksResult } from '../types.js';

export interface ExtractTasksOptions {
  threadId?: string;
  minDurationMs?: number;
  tree?: 'bottom-up' | 'top-down';
  top?: number;
  urlOnly?: boolean;
  timeRange?: TimeRange;
}

function rankAndLimit<T extends { score: number }>(candidates: T[], limit: number): void {
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > limit) candidates.length = limit;
}

/**
 * Extracts long main thread tasks and aggregated top-down / bottom-up call trees.
 */
export function extractTasks(loadedTrace: LoadedTrace, options?: ExtractTasksOptions): TasksResult {
  const { engine, parsedTrace } = loadedTrace;
  const minDurationMs = options?.minDurationMs ?? 50;
  const top = Math.trunc(options?.top ?? 20);
  const urlOnly = options?.urlOnly;
  const treeMode = options?.tree;
  const timeRange = options?.timeRange;

  const mainThread = getRendererThread(parsedTrace.data, options?.threadId);

  const result: TasksResult = { mode: treeMode ?? 'list', threadId: options?.threadId, tasks: [] };
  if (!mainThread) return result;
  if (!mainThread.profileCalls.length) result.warnings = [MISSING_CPU_SAMPLES];
  if (!(top > 0)) return result;

  const traceBounds = parsedTrace.data.Meta.traceBounds;
  const treeOptions = {
    startTime: engine.Types.Timing.Micro(
      timeRange ? milliToMicro(timeRange.startMs) : traceBounds.min,
    ),
    endTime: engine.Types.Timing.Micro(timeRange ? milliToMicro(timeRange.endMs) : traceBounds.max),
  };
  const traceTree = engine.Extras.TraceTree;
  const cpuFilter = rendererCpuFilter(loadedTrace);
  type TreeNode = InstanceType<typeof traceTree.Node>;

  function treeItem(node: TreeNode): TaskItem {
    const frame = traceTree.eventStackFrame(node.event);
    // Bottom-up nodes are created in event end order. A recursive call can end before its caller.
    const firstTs = node.events.reduce<number>(
      (min, event) => Math.min(min, event.ts),
      node.event.ts,
    );
    return {
      startTimeMs: round(microToMilli(firstTs)),
      durationMs: round(microToMilli(node.totalTime)),
      selfTimeMs: round(microToMilli(node.selfTime)),
      functionName: frame?.functionName || node.event.name,
      url: frame?.url || undefined,
      lineNumber: frame?.lineNumber,
      columnNumber: frame?.columnNumber,
    };
  }

  if (treeMode === 'bottom-up') {
    const bottomUp = new traceTree.BottomUpRootNode(mainThread.entries, {
      ...treeOptions,
      textFilter: { accept: () => true },
      filters: [cpuFilter],
    });

    const candidates: Array<{ node: TreeNode; score: number }> = [];
    for (const node of bottomUp.children().values()) {
      if (node.selfTime > 0 && (!urlOnly || traceTree.eventStackFrame(node.event)?.url)) {
        candidates.push({ node, score: round(microToMilli(node.selfTime)) });
        // Trim in batches to bound memory and sort work for a small --top.
        if (candidates.length === top * 2) rankAndLimit(candidates, top);
      }
    }
    rankAndLimit(candidates, top);

    for (const { node } of candidates) result.tasks.push(treeItem(node));
    return result;
  }

  if (treeMode === 'top-down') {
    const topDown = new traceTree.TopDownRootNode(mainThread.entries, {
      ...treeOptions,
      filters: options?.urlOnly
        ? [cpuFilter, { accept: (event) => Boolean(traceTree.eventStackFrame(event)?.url) }]
        : [cpuFilter],
    });

    // TraceTree computes descendants on demand. Expand only the most expensive paths.
    const pending: Array<{ node: TreeNode; parents: string[] }> = [
      ...topDown.children().values(),
    ].map((node) => ({ node, parents: [] }));
    while (pending.length && result.tasks.length < top) {
      pending.sort((a, b) => b.node.totalTime - a.node.totalTime);
      const next = pending.shift();
      if (!next) break;
      const item = treeItem(next.node);
      const callPath = [...next.parents, item.functionName];
      result.tasks.push({ ...item, callPath });
      if (result.tasks.length === top || !next.node.hasChildren()) continue;
      for (const node of next.node.children().values()) pending.push({ node, parents: callPath });
    }
    return result;
  }

  const candidates: Array<{ entry: (typeof mainThread.entries)[number]; score: number }> = [];
  // URL eligibility is only known after inspecting a task's descendants.
  const candidateLimit = urlOnly ? Infinity : top;

  for (const entry of mainThread.entries) {
    if (!entry.dur || (entry.name !== 'RunTask' && !engine.Helpers.Trace.isTopLevelEvent(entry))) {
      continue;
    }
    const durationMs = microToMilli(entry.dur);
    const startTimeMs = microToMilli(entry.ts);
    if (durationMs < minDurationMs || !isEventInBounds(startTimeMs, durationMs, timeRange)) {
      continue;
    }

    candidates.push({ entry, score: round(durationMs) });
    if (candidates.length === candidateLimit * 2) rankAndLimit(candidates, candidateLimit);
  }
  rankAndLimit(candidates, candidateLimit);

  const entryToNode = parsedTrace.data.Renderer?.entryToNode;
  for (const { entry, score: durationMs } of candidates) {
    if (result.tasks.length === top) break;

    const node = entryToNode?.get(entry);
    let source = entry;
    let frame = traceTree.eventStackFrame(entry);
    if (node && !frame?.url) {
      let bestTime = -1;
      const pending = [...node.children];
      while (pending.length > 0) {
        const child = pending.pop();
        if (!child) break;
        const childFrame = traceTree.eventStackFrame(child.entry);
        const time = child.selfTime ?? child.entry.dur ?? 0;
        if (childFrame?.url && childFrame.functionName && time > bestTime) {
          source = child.entry;
          frame = childFrame;
          bestTime = time;
        }
        for (const descendant of child.children) pending.push(descendant);
      }

      if (source === entry && !frame?.functionName && node.children[0]) {
        source = node.children[0].entry;
        frame = traceTree.eventStackFrame(source);
      }
    }

    if (urlOnly && !frame?.url) continue;
    const name = frame?.functionName || source.name;
    result.tasks.push({
      startTimeMs: round(microToMilli(entry.ts)),
      durationMs,
      selfTimeMs: round(microToMilli(node?.selfTime ?? entry.dur ?? 0)),
      functionName: source === entry ? name : `${entry.name} > ${name}`,
      url: frame?.url || undefined,
      lineNumber: frame?.lineNumber,
      columnNumber: frame?.columnNumber,
    });
  }

  return result;
}
