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
import { extractInteractions } from '../../src/engine/extractors/interactions.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Interactions Extractor', () => {
  test('extractInteractions handles empty interaction traces gracefully', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractInteractions(loaded);
    assert.deepEqual(result.interactions, []);
  });

  test('extractInteractions parses interaction event timings and targets', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/interaction-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractInteractions(loaded);
    assert.equal(result.interactions.length, 1);

    const item = result.interactions[0];
    assert.equal(item.eventType, 'click');
    assert.equal(item.startTimeMs, 1200);
    assert.equal(item.durationMs, 250);
    assert.equal(item.inputDelayMs, 5);
    assert.equal(item.processingDurationMs, 200);
    assert.equal(item.presentationDelayMs, 45);
    assert.equal(item.targetElement, 'BUTTON');
  });

  test('extractInteractions filters by time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/interaction-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const inside = extractInteractions(loaded, {
      timeRange: { startMs: 1100, endMs: 1500 },
    });
    assert.equal(inside.interactions.length, 1);

    const outside = extractInteractions(loaded, {
      timeRange: { startMs: 0, endMs: 500 },
    });
    assert.equal(outside.interactions.length, 0);
  });
});
