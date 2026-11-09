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
import path from 'node:path';
import test, { describe } from 'node:test';
import { extractDiff } from '../../src/engine/extractors/diff.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Diff Extractor', () => {
  test('compares CPU self-time between two windows and computes shift deltas', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractDiff(loaded, {
      windowA: { startMs: 500, endMs: 900 },
      windowB: { startMs: 1000, endMs: 1200 },
      top: 5,
    });

    assert.equal(result.windowA.startMs, 500);
    assert.equal(result.windowA.endMs, 900);
    assert.equal(result.windowB.startMs, 1000);
    assert.equal(result.windowB.endMs, 1200);

    assert.ok(result.entries.length > 0);
    const runTaskDiff = result.entries.find((e) => e.functionName === 'RunTask');
    assert.ok(runTaskDiff);
    assert.equal(runTaskDiff.selfTimeMsA, 0);
    assert.equal(runTaskDiff.selfTimePctA, 0);
    assert.equal(runTaskDiff.selfTimeMsB, 60);
    assert.equal(runTaskDiff.selfTimePctB, 100);
    assert.equal(runTaskDiff.deltaPct, 100);
  });

  test('compares execution windows with stack frames on navigation trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractDiff(loaded, {
      windowA: { startMs: 1400, endMs: 1550 },
      windowB: { startMs: 2400, endMs: 2500 },
      top: 5,
    });

    assert.equal(result.windowA.startMs, 1400);
    assert.equal(result.windowA.endMs, 1550);
    assert.equal(result.windowB.startMs, 2400);
    assert.equal(result.windowB.endMs, 2500);

    const bootAppDiff = result.entries.find((e) => e.functionName === 'bootApp');
    assert.ok(bootAppDiff);
    assert.equal(bootAppDiff.url, 'https://example.com/app.js');
    assert.equal(bootAppDiff.selfTimeMsA, 70);
    assert.equal(bootAppDiff.selfTimeMsB, 0);
    assert.ok(bootAppDiff.deltaPct < 0);
    assert.equal(bootAppDiff.deltaPct, -58.3);

    const majorGCDiff = result.entries.find((e) => e.functionName === 'MajorGC');
    assert.ok(majorGCDiff);
    assert.equal(majorGCDiff.selfTimeMsA, 0);
    assert.equal(majorGCDiff.selfTimeMsB, 25);
    assert.ok(majorGCDiff.deltaPct > 0);
    assert.equal(majorGCDiff.deltaPct, 41.7);
  });
});
