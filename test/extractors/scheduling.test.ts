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
import { extractScheduling } from '../../src/engine/extractors/scheduling.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Scheduling Extractor', () => {
  test('extracts animation frame and timer scheduling counts and cancellation rates', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/scheduling-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractScheduling(loaded);

    // Animation Frames
    assert.equal(result.animationFrames.scheduledCount, 2);
    assert.equal(result.animationFrames.canceledCount, 1);
    assert.equal(result.animationFrames.executedCount, 1);
    assert.equal(result.animationFrames.cancellationRatePct, 50);

    // Timers
    assert.equal(result.timers.scheduledCount, 1);
    assert.equal(result.timers.canceledCount, 0);
    assert.equal(result.timers.executedCount, 1);
    assert.equal(result.timers.cancellationRatePct, 0);

    assert.equal(result.churnDetected, false);
  });

  test('filters scheduling by time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/scheduling-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const inside = extractScheduling(loaded, {
      timeRange: { startMs: 1100, endMs: 1210 },
    });
    assert.equal(inside.animationFrames.scheduledCount, 2);
    assert.equal(inside.timers.scheduledCount, 0);

    const outside = extractScheduling(loaded, {
      timeRange: { startMs: 0, endMs: 500 },
    });
    assert.equal(outside.animationFrames.scheduledCount, 0);
  });
});
