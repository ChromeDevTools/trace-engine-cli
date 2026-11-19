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
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { extractShifts } from '../../src/engine/extractors/shifts.js';
import { getPropertyByPath } from '../../src/engine/helpers.js';
import { loadTraceFromFile, parseTraceJson } from '../../src/engine/loader.js';
import { formatResult } from '../../src/formatters/index.js';

describe('Layout Shifts Extractor', () => {
  test('extractShifts warns when the recording has no layout shift data', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractShifts(loaded);
    assert.deepEqual(result.clusters, []);
    assert.match(result.warnings?.[0] ?? '', /loading category/);
  });

  test('extractShifts parses cluster score and culprit elements', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractShifts(loaded);
    assert.equal(result.clusters.length, 1);

    const cluster = result.clusters[0];
    assert.equal(cluster.timestampMs, 1300);
    assert.equal(cluster.cumulativeScore, 0.15);
    assert.equal(cluster.navigationId, 'NAV_1');
    assert.equal(cluster.events, undefined);
    assert.equal(cluster.culprits.length, 1);
    assert.equal(cluster.culprits[0].tagName, 'DIV');
    assert.equal(cluster.culprits[0].selector, '#banner');
    assert.equal(cluster.culprits[0].debugName, 'banner-ad');
    assert.equal(cluster.culprits[0].scoreDelta, 0.15);
  });

  test('extractShifts filters clusters by timeRange', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const outsideResult = extractShifts(loaded, {
      timeRange: { startMs: 0, endMs: 500 },
    });
    assert.equal(outsideResult.clusters.length, 0);

    const insideResult = extractShifts(loaded, {
      timeRange: { startMs: 1200, endMs: 1400 },
    });
    assert.equal(insideResult.clusters.length, 1);
  });

  test('keeps distinct culprits with missing node metadata and shows recorded rectangles', async (t) => {
    const fixture = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const events = parseTraceJson(await readFile(fixture, 'utf8')).filter(
      (event) => getPropertyByPath(event, 'name') !== 'LayoutShift',
    );
    events.push({
      name: 'LayoutShift',
      cat: 'loading',
      ph: 'I',
      pid: 100,
      tid: 1,
      ts: 1300000,
      args: {
        frame: 'FRAME_0',
        data: {
          is_main_frame: true,
          had_recent_input: false,
          weighted_score_delta: 0.15,
          impacted_nodes: [
            { selector: '#first' },
            { debug_name: 'second' },
            { node_id: 42, old_rect: [0, 1, 40, 20], new_rect: [0, 7, 40, 20] },
            { old_rect: [0, 2, 5, 6], new_rect: [0, 4, 5, 6] },
            { old_rect: [0, 3, 5, 6], new_rect: [0, 5, 5, 6] },
          ],
        },
      },
    });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'trace-shifts-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'trace.json');
    await writeFile(file, JSON.stringify(events));

    const result = extractShifts(await loadTraceFromFile(file));
    assert.equal(result.clusters[0].culprits.length, 5);
    const output = formatResult(result, { format: 'md', type: 'shifts' });
    assert.match(output, /#first/);
    assert.match(output, /second/);
    assert.match(output, /Node #42 \(PID 100\) \[0, 1, 40, 20\] → \[0, 7, 40, 20\]/);
    assert.match(output, /DOM names and selectors were unavailable/);
  });

  test('extractShifts extracts individual events when includeEvents is true', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractShifts(loaded, { includeEvents: true });
    assert.equal(result.clusters.length, 1);

    const cluster = result.clusters[0];
    assert.ok(cluster.events);
    assert.equal(cluster.events.length, 1);

    const ev = cluster.events[0];
    assert.equal(ev.timestampMs, 1300);
    assert.equal(ev.score, 0.15);
    assert.equal(ev.navigationId, 'NAV_1');
    assert.equal(ev.hadRecentInput, false);
    assert.ok(ev.impactedNodes);
    assert.equal(ev.impactedNodes.length, 1);
    assert.equal(ev.impactedNodes[0].nodeId, 42);
    assert.equal(ev.impactedNodes[0].debugName, 'banner-ad');
    assert.equal(ev.impactedNodes[0].selector, '#banner');
  });
});
