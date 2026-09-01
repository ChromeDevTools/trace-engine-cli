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

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import type {
  DiffResult,
  EventsResult,
  FindResult,
  InsightsResult,
  InteractionsResult,
  NavigationsResult,
  NetworkResult,
  OverviewResult,
  ProfileResult,
  ScanResult,
  SchedulingResult,
  ShiftsResult,
  TasksResult,
} from '../../src/engine/types.js';
import {
  formatDiffMarkdown,
  formatEventsMarkdown,
  formatFindMarkdown,
  formatInsightsMarkdown,
  formatInteractionsMarkdown,
  formatMarkdown,
  formatNavigationsMarkdown,
  formatNetworkMarkdown,
  formatOverviewMarkdown,
  formatProfileMarkdown,
  formatScanMarkdown,
  formatSchedulingMarkdown,
  formatShiftsMarkdown,
  formatTasksMarkdown,
} from '../../src/formatters/markdown.js';

describe('Markdown Formatter', () => {
  test('formatOverviewMarkdown formats overview structure', () => {
    const overview: OverviewResult = {
      bounds: { minMs: 100, maxMs: 1100, durationMs: 1000 },
      mainUrl: 'https://example.com',
      navigationStartMs: 150,
      coreWebVitals: {
        fcp: { valueMs: 200, rating: 'good' },
        lcp: { valueMs: 500, rating: 'good', url: 'https://example.com/hero.jpg' },
        cls: { value: 0.05, rating: 'good', worstClusterScore: 0.05 },
        inp: { valueMs: 80, rating: 'good', interactionType: 'pointerdown' },
      },
      mainThreadBreakdown: {
        scriptingMs: 200,
        layoutMs: 100,
        renderingMs: 50,
        gcMs: 20,
        systemMs: 50,
        idleMs: 580,
        totalMs: 1000,
      },
      warnings: ['High render delay'],
    };

    const output = formatOverviewMarkdown(overview);
    assert.ok(output.includes('# Trace Overview'));
    assert.ok(output.includes('https://example.com'));
    assert.ok(output.includes('## Core Web Vitals'));
    assert.ok(output.includes('| FCP | 200ms | good | - |'));
    assert.ok(output.includes('## Main Thread Time Breakdown'));
    assert.ok(output.includes('| Scripting | 200ms | 20.0% |'));
    assert.ok(output.includes('## Warnings & Diagnostics'));
  });

  test('formatInsightsMarkdown formats insight categories', () => {
    const insights: InsightsResult = {
      lcpBreakdown: {
        totalLcpMs: 500,
        ttfbMs: 100,
        loadDelayMs: 50,
        loadDurationMs: 200,
        renderDelayMs: 150,
        lcpUrl: 'https://example.com/hero.jpg',
      },
      inpBreakdown: {
        totalDurationMs: 120,
        inputDelayMs: 10,
        processingDurationMs: 90,
        presentationDelayMs: 20,
        eventType: 'click',
      },
      clsCulprits: [
        {
          score: 0.05,
          timestampMs: 300,
          culpritNodes: ['Node #12'],
        },
      ],
      renderBlocking: [
        {
          url: 'https://example.com/style.css',
          durationMs: 40,
          transferSizeBytes: 1024,
        },
      ],
      thirdParties: [
        {
          entityName: 'Google Analytics',
          mainThreadTimeMs: 30,
          transferSizeBytes: 2048,
        },
      ],
      warnings: ['Resource warning'],
    };

    const output = formatInsightsMarkdown(insights);
    assert.ok(output.includes('# Diagnostic Insights'));
    assert.ok(output.includes('## LCP Breakdown'));
    assert.ok(output.includes('## INP Breakdown'));
    assert.ok(output.includes('## CLS Culprits'));
    assert.ok(output.includes('## Render Blocking Resources'));
    assert.ok(output.includes('## Third-Party Entities'));
  });

  test('formatTasksMarkdown formats tasks list', () => {
    const tasks: TasksResult = {
      mode: 'list',
      tasks: [
        {
          startTimeMs: 100,
          durationMs: 60,
          selfTimeMs: 60,
          functionName: 'RunTask',
          url: 'https://example.com/script.js',
          lineNumber: 42,
        },
      ],
    };

    const output = formatTasksMarkdown(tasks);
    assert.ok(output.includes('# Tasks (list)'));
    assert.ok(output.includes('`RunTask`'));
    assert.ok(output.includes('`https://example.com/script.js:42`'));
  });

  test('formatFindMarkdown formats find results', () => {
    const findRes: FindResult = {
      functionQuery: 'drawEventTiles',
      totalCalls: 10,
      totalDurationMs: 25,
      avgDurationMs: 2.5,
      firstCallMs: 4000,
      lastCallMs: 4100,
      calls: [{ timestampMs: 4000, durationMs: 2.5, url: 'flame_chart.ts', lineNumber: 100 }],
      intervals: [{ startMs: 3500, endMs: 4000, calls: 0, totalDurationMs: 0 }],
    };

    const output = formatFindMarkdown(findRes);
    assert.ok(output.includes('# Function Execution: `drawEventTiles`'));
    assert.ok(output.includes('- **Total Calls**: `10`'));
    assert.ok(output.includes('| 3500ms - 4000ms | 0 | 0ms |'));
  });

  test('formatProfileMarkdown formats profile buckets', () => {
    const prof: ProfileResult = {
      timeRange: { startMs: 1000, endMs: 1200 },
      bucketSizeMs: 100,
      buckets: [
        {
          startMs: 1000,
          endMs: 1100,
          totalActiveMs: 80,
          topFunctions: [{ name: 'updateCurtains', selfTimeMs: 60, selfTimePct: 75 }],
        },
      ],
    };

    const output = formatProfileMarkdown(prof);
    assert.ok(output.includes('# CPU Profile Progression (100ms buckets)'));
    assert.ok(output.includes('updateCurtains (75%)'));
  });

  test('formatDiffMarkdown formats differential comparison', () => {
    const diff: DiffResult = {
      windowA: { startMs: 1000, endMs: 1200, durationMs: 200 },
      windowB: { startMs: 1200, endMs: 1400, durationMs: 200 },
      entries: [
        {
          functionName: 'drawEventTiles',
          selfTimeMsA: 0,
          selfTimePctA: 0,
          selfTimeMsB: 50,
          selfTimePctB: 25,
          deltaPct: 25,
        },
      ],
    };

    const output = formatDiffMarkdown(diff);
    assert.ok(output.includes('# Differential Profile'));
    assert.ok(output.includes('`drawEventTiles`'));
    assert.ok(output.includes('**+25%**'));
  });

  test('formatSchedulingMarkdown formats async metrics', () => {
    const sched: SchedulingResult = {
      animationFrames: {
        scheduledCount: 10,
        canceledCount: 8,
        executedCount: 2,
        cancellationRatePct: 80,
      },
      timers: { scheduledCount: 5, canceledCount: 0, executedCount: 5, cancellationRatePct: 0 },
      churnDetected: true,
      warnings: ['High rAF cancellation rate'],
    };

    const output = formatSchedulingMarkdown(sched);
    assert.ok(output.includes('# Async Task & Animation Scheduling'));
    assert.ok(output.includes('- **Cancellation Rate**: `80%`'));
    assert.ok(output.includes('High rAF cancellation rate'));
  });

  test('formatNetworkMarkdown formats waterfall and initiator chain', () => {
    const network: NetworkResult = {
      initiatorChain: [
        { url: 'https://example.com/script.js', initiatorUrl: 'https://example.com' },
      ],
      requests: [
        {
          url: 'https://example.com/test',
          mimeType: 'text/html',
          priority: 'VeryHigh',
          timing: {
            queueingMs: 1,
            dnsMs: 5,
            sslMs: 10,
            ttfbMs: 20,
            downloadMs: 5,
            totalDurationMs: 41,
          },
          transferSizeBytes: 5000,
          renderBlocking: true,
        },
      ],
    };

    const output = formatNetworkMarkdown(network);
    assert.ok(output.includes('# Network Requests'));
    assert.ok(output.includes('## Initiator Chain'));
    assert.ok(output.includes('`https://example.com/test`'));
  });

  test('formatInteractionsMarkdown formats interaction items', () => {
    const interactions: InteractionsResult = {
      interactions: [
        {
          eventType: 'click',
          startTimeMs: 200,
          durationMs: 80,
          inputDelayMs: 5,
          processingDurationMs: 60,
          presentationDelayMs: 15,
          targetElement: 'BUTTON',
        },
      ],
    };

    const output = formatInteractionsMarkdown(interactions);
    assert.ok(output.includes('# User Interactions'));
    assert.ok(output.includes('`click`'));
    assert.ok(output.includes('`BUTTON`'));
  });

  test('formatShiftsMarkdown formats layout shift clusters', () => {
    const shifts: ShiftsResult = {
      clusters: [
        {
          timestampMs: 300,
          durationMs: 50,
          cumulativeScore: 0.12,
          navigationId: 'NAV_42',
          culprits: [
            {
              tagName: 'DIV',
              selector: '#banner',
              debugName: 'ad-banner',
              scoreDelta: 0.12,
            },
          ],
          events: [
            {
              timestampMs: 300,
              score: 0.12,
              navigationId: 'NAV_42',
              hadRecentInput: false,
              impactedNodes: [
                {
                  nodeId: 10,
                  tagName: 'DIV',
                  selector: '#banner',
                  debugName: 'ad-banner',
                },
              ],
            },
          ],
        },
      ],
    };

    const output = formatShiftsMarkdown(shifts);
    assert.ok(output.includes('# Layout Shifts'));
    assert.ok(output.includes('NAV_42'));
    assert.ok(output.includes('ad-banner'));
    assert.ok(output.includes('#banner'));
    assert.ok(output.includes('## Individual Shift Events'));
  });

  test('formatEventsMarkdown formats raw trace events table', () => {
    const eventsRes: EventsResult = {
      totalMatched: 1,
      returned: 1,
      events: [
        {
          name: 'LayoutShift',
          tsMs: 1200,
          durMs: 0,
          cat: 'loading',
          ph: 'I',
          pid: 100,
          tid: 1,
        },
      ],
    };

    const output = formatEventsMarkdown(eventsRes);
    assert.ok(output.includes('# Raw Trace Events'));
    assert.ok(output.includes('`LayoutShift`'));
    assert.ok(output.includes('loading'));
  });

  test('formatEventsMarkdown handles empty event matches gracefully', () => {
    const eventsRes: EventsResult = {
      totalMatched: 0,
      returned: 0,
      events: [],
    };
    const output = formatEventsMarkdown(eventsRes);
    assert.ok(output.includes('# Raw Trace Events'));
    assert.ok(output.includes('No matching trace events found.'));
  });

  test('formatEventsMarkdown escapes pipe and newline characters in selected fields', () => {
    const eventsRes: EventsResult = {
      totalMatched: 1,
      returned: 1,
      events: [
        {
          name: 'CustomEvent',
          tsMs: 100,
          selectedFields: {
            'data.pipe': 'a|b|c',
            'data.multiline': 'line1\nline2',
          },
        },
      ],
    };
    const output = formatEventsMarkdown(eventsRes);
    assert.ok(output.includes('`a\\|b\\|c`'));
    assert.ok(output.includes('`line1 line2`'));
  });

  test('formatEventsMarkdown formats selected fields table', () => {
    const eventsRes: EventsResult = {
      totalMatched: 1,
      returned: 1,
      events: [
        {
          name: 'LayoutShift',
          tsMs: 1200,
          selectedFields: {
            'args.data.navigationId': 'NAV_1',
            'args.data.score': 0.15,
          },
        },
      ],
    };

    const output = formatEventsMarkdown(eventsRes);
    assert.ok(output.includes('# Raw Trace Events'));
    assert.ok(output.includes('args.data.navigationId'));
    assert.ok(output.includes('NAV_1'));
  });

  test('formatNavigationsMarkdown formats navigations and insight set IDs', () => {
    const navsRes: NavigationsResult = {
      total: 1,
      insightSetIds: ['NAV_1'],
      navigations: [
        {
          navigationId: 'NAV_1',
          url: 'https://example.com',
          timestampMs: 500,
          frameId: 'FRAME_1',
          isMainFrame: true,
          hasInsights: true,
        },
      ],
    };

    const output = formatNavigationsMarkdown(navsRes);
    assert.ok(output.includes('# Trace Navigations'));
    assert.ok(output.includes('NAV_1'));
    assert.ok(output.includes('https://example.com'));
    assert.ok(output.includes('FRAME_1'));
  });

  test('formatNavigationsMarkdown handles empty navigations gracefully', () => {
    const navsRes: NavigationsResult = {
      total: 0,
      insightSetIds: [],
      navigations: [],
    };
    const output = formatNavigationsMarkdown(navsRes);
    assert.ok(output.includes('# Trace Navigations'));
    assert.ok(output.includes('No navigation events found in trace.'));
  });

  test('formatShiftsMarkdown formats culprit with nodeId 0 correctly', () => {
    const shifts: ShiftsResult = {
      clusters: [
        {
          timestampMs: 100,
          durationMs: 0,
          cumulativeScore: 0.05,
          culprits: [{ nodeId: 0, scoreDelta: 0.05 }],
        },
      ],
    };
    const output = formatShiftsMarkdown(shifts);
    assert.ok(output.includes('Node #0'));
  });

  test('formatScanMarkdown formats scan results with matched files', () => {
    const scan: ScanResult = {
      query: { names: ['LayoutShift'], category: 'devtools.timeline' },
      totalFilesScanned: 10,
      totalFilesMatched: 1,
      totalEventsMatched: 3,
      matchedFiles: [
        {
          file: 'fixtures/shifts-trace.json',
          matchCount: 3,
          categories: ['devtools.timeline'],
          firstEventName: 'LayoutShift',
          firstEventTsMs: 120.5,
        },
      ],
    };
    const output = formatScanMarkdown(scan);
    assert.ok(output.includes('# Trace Scan Results'));
    assert.ok(output.includes('- **Files Scanned**: 10'));
    assert.ok(output.includes('- **Files Matched**: 1'));
    assert.ok(output.includes('`fixtures/shifts-trace.json`'));
    assert.ok(output.includes('120.5ms'));
  });

  test('formatScanMarkdown handles 0 matches gracefully', () => {
    const scan: ScanResult = {
      query: { grep: 'MissingString' },
      totalFilesScanned: 5,
      totalFilesMatched: 0,
      totalEventsMatched: 0,
      matchedFiles: [],
    };
    const output = formatScanMarkdown(scan);
    assert.ok(output.includes('# Trace Scan Results'));
    assert.ok(output.includes('No matching trace files found.'));
  });

  test('formatScanMarkdown indicates truncation and escapes pipe characters', () => {
    const scan: ScanResult = {
      query: { names: ['Custom|Event'] },
      totalFilesScanned: 20,
      totalFilesMatched: 10,
      totalEventsMatched: 25,
      matchedFiles: [
        {
          file: 'path/to|file.json',
          matchCount: 5,
          categories: ['cat|1', 'cat|2'],
          firstEventName: 'Custom|Event',
          firstEventTsMs: 50,
        },
      ],
    };
    const output = formatScanMarkdown(scan);
    assert.ok(output.includes('- **Files Matched**: 10 (showing top 1)'));
    assert.ok(output.includes('`path/to\\|file.json`'));
    assert.ok(output.includes('cat\\|1, cat\\|2'));
    assert.ok(output.includes('`Custom\\|Event`'));
  });

  test('formatMarkdown dispatches appropriately', () => {
    const output = formatMarkdown(
      {
        mode: 'list',
        tasks: [],
      },
      'tasks',
    );
    assert.ok(output.includes('# Tasks (list)'));

    const eventsOutput = formatMarkdown(
      {
        totalMatched: 0,
        returned: 0,
        events: [],
      },
      'events',
    );
    assert.ok(eventsOutput.includes('# Raw Trace Events'));

    const navsOutput = formatMarkdown(
      {
        total: 0,
        navigations: [],
        insightSetIds: [],
      },
      'navigations',
    );
    assert.ok(navsOutput.includes('# Trace Navigations'));

    const scanOutput = formatMarkdown(
      {
        query: { names: ['LayoutShift'] },
        totalFilesScanned: 1,
        totalFilesMatched: 0,
        totalEventsMatched: 0,
        matchedFiles: [],
      },
      'scan',
    );
    assert.ok(scanOutput.includes('# Trace Scan Results'));
  });
});
