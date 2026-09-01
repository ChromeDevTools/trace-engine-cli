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
import { extractProfile } from '../../src/engine/extractors/profile.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Profile Extractor', () => {
  test('slices time window into buckets and computes top functions', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractProfile(loaded, {
      timeRange: { startMs: 1000, endMs: 1300 },
      bucketMs: 100,
      top: 3,
    });

    assert.equal(result.timeRange.startMs, 1000);
    assert.equal(result.timeRange.endMs, 1300);
    assert.equal(result.bucketSizeMs, 100);
    assert.equal(result.buckets.length, 3);

    // Bucket 1: 1000 - 1100ms
    assert.equal(result.buckets[0].startMs, 1000);
    assert.equal(result.buckets[0].endMs, 1100);

    // Bucket 2: 1100 - 1200ms (RunTask runs here at 1100ms for 60ms)
    assert.equal(result.buckets[1].startMs, 1100);
    assert.equal(result.buckets[1].endMs, 1200);
    assert.ok(result.buckets[1].totalActiveMs > 0);
    assert.ok(result.buckets[1].topFunctions.length > 0);
    assert.equal(result.buckets[1].topFunctions[0].name, 'RunTask');
    assert.equal(result.buckets[1].topFunctions[0].selfTimeMs, 60);
    assert.equal(result.buckets[1].topFunctions[0].selfTimePct, 100);
  });
});
