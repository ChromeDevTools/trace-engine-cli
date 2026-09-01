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
import { getMainRendererThread } from '../helpers.js';
import type { LoadedTrace } from '../loader.js';
import type { TaskItem, TasksResult } from '../types.js';

export interface ExtractTasksOptions {
  minDurationMs?: number;
  tree?: 'bottom-up' | 'top-down';
  top?: number;
  timeRange?: TimeRange;
}

interface RawTreeNode {
  entry: { name: string; dur?: number };
  children?: RawTreeNode[];
}

/**
 * Extracts long main thread tasks and aggregated top-down / bottom-up call trees.
 */
export function extractTasks(loadedTrace: LoadedTrace, options?: ExtractTasksOptions): TasksResult {
  const { engine, parsedTrace } = loadedTrace;
  const minDurationMs = options?.minDurationMs ?? 50;
  const top = options?.top ?? 20;
  const treeMode = options?.tree;
  const timeRange = options?.timeRange;

  const mainThread = getMainRendererThread(parsedTrace.data);

  if (!mainThread) {
    return {
      mode: treeMode || 'list',
      tasks: [],
    };
  }

  const traceBounds = parsedTrace.data.Meta.traceBounds;
  const startMs = timeRange ? timeRange.startMs : microToMilli(traceBounds.min);
  const endMs = timeRange ? timeRange.endMs : microToMilli(traceBounds.max);

  if (treeMode === 'bottom-up') {
    const bottomUp = new engine.Extras.TraceTree.BottomUpRootNode(
      mainThread.entries as unknown as ConstructorParameters<
        typeof engine.Extras.TraceTree.BottomUpRootNode
      >[0],
      {
        textFilter: { accept: () => true },
        filters: [],
        startTime: engine.Types.Timing.Milli(startMs),
        endTime: engine.Types.Timing.Milli(endMs),
      },
    );

    const tasks: TaskItem[] = [];
    const children = bottomUp.children();
    for (const node of children.values()) {
      if (node.selfTime <= 0) continue;
      // biome-ignore lint/suspicious/noExplicitAny: generic trace event
      const frame = engine.Extras.TraceTree.eventStackFrame(node.event as any);
      tasks.push({
        startTimeMs: round(startMs),
        durationMs: round(node.totalTime),
        selfTimeMs: round(node.selfTime),
        functionName: frame?.functionName || node.event?.name || String(node.id) || 'Unknown',
        url: frame?.url || undefined,
        lineNumber: frame?.lineNumber,
        columnNumber: frame?.columnNumber,
      });
    }

    tasks.sort((a, b) => b.selfTimeMs - a.selfTimeMs);
    return {
      mode: 'bottom-up',
      tasks: tasks.slice(0, top),
    };
  }

  if (treeMode === 'top-down') {
    const topDown = new engine.Extras.TraceTree.TopDownRootNode(
      mainThread.entries as unknown as ConstructorParameters<
        typeof engine.Extras.TraceTree.TopDownRootNode
      >[0],
      {
        filters: [],
        startTime: engine.Types.Timing.Milli(startMs),
        endTime: engine.Types.Timing.Milli(endMs),
      },
    );

    const tasks: TaskItem[] = [];
    const children = topDown.children();
    for (const node of children.values()) {
      // biome-ignore lint/suspicious/noExplicitAny: generic trace event
      const frame = engine.Extras.TraceTree.eventStackFrame(node.event as any);
      tasks.push({
        startTimeMs: round(startMs),
        durationMs: round(node.totalTime),
        selfTimeMs: round(node.selfTime),
        functionName: frame?.functionName || node.event?.name || String(node.id) || 'Unknown',
        url: frame?.url || undefined,
        lineNumber: frame?.lineNumber,
        columnNumber: frame?.columnNumber,
      });
    }

    tasks.sort((a, b) => b.durationMs - a.durationMs);
    return {
      mode: 'top-down',
      tasks: tasks.slice(0, top),
    };
  }

  // Default List Mode
  const tasks: TaskItem[] = [];
  const entryToNode = parsedTrace.data.Renderer?.entryToNode as
    | Map<unknown, RawTreeNode>
    | undefined;

  for (const entry of mainThread.entries) {
    if (!entry.dur) continue;
    const durMs = microToMilli(entry.dur);
    const startEntryMs = microToMilli(entry.ts);

    if (durMs < minDurationMs) continue;
    if (!isEventInBounds(startEntryMs, durMs, timeRange)) continue;

    // biome-ignore lint/suspicious/noExplicitAny: trace helper accepts generic event
    const isTop = entry.name === 'RunTask' || engine.Helpers.Trace.isTopLevelEvent(entry as any);

    if (isTop) {
      let functionName = entry.name;
      let url: string | undefined;
      let lineNumber: number | undefined;
      let columnNumber: number | undefined;
      let selfTimeMs = durMs;

      // biome-ignore lint/suspicious/noExplicitAny: stack frame extraction accepts generic event
      const frame = engine.Extras.TraceTree.eventStackFrame(entry as any);
      if (frame?.functionName) {
        functionName = frame.functionName;
        url = frame.url;
        lineNumber = frame.lineNumber;
        columnNumber = frame.columnNumber;
      }

      if (entryToNode) {
        const node = entryToNode.get(entry);
        if (node?.children && node.children.length > 0) {
          let childDurationSum = 0;
          for (const c of node.children) {
            childDurationSum += microToMilli(c.entry.dur ?? 0);
          }
          selfTimeMs = Math.max(0, durMs - childDurationSum);

          if (!frame?.functionName) {
            const mainChild = node.children[0].entry;
            // biome-ignore lint/suspicious/noExplicitAny: stack frame extraction accepts generic event
            const childFrame = engine.Extras.TraceTree.eventStackFrame(mainChild as any);
            functionName = `${entry.name} > ${childFrame?.functionName || mainChild.name}`;
            url = childFrame?.url;
            lineNumber = childFrame?.lineNumber;
            columnNumber = childFrame?.columnNumber;
          }
        }
      }

      tasks.push({
        startTimeMs: round(startEntryMs),
        durationMs: round(durMs),
        selfTimeMs: round(selfTimeMs),
        functionName,
        url,
        lineNumber,
        columnNumber,
      });
    }
  }

  tasks.sort((a, b) => b.durationMs - a.durationMs);
  return {
    mode: 'list',
    tasks: tasks.slice(0, top),
  };
}
