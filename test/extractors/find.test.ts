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
import { extractFind } from '../../src/engine/extractors/find.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Find Extractor', () => {
  test('finds matching function calls and returns occurrence telemetry', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractFind(loaded, {
      functionName: 'RunTask',
    });

    assert.equal(result.functionQuery, 'RunTask');
    assert.equal(result.totalCalls, 1);
    assert.equal(result.totalDurationMs, 60);
    assert.equal(result.avgDurationMs, 60);
    assert.equal(result.firstCallMs, 1100);
    assert.equal(result.lastCallMs, 1100);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].timestampMs, 1100);
    assert.equal(result.calls[0].durationMs, 60);
  });

  test('reports 0 calls for non-existent function name', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractFind(loaded, {
      functionName: 'nonExistentFunction',
    });

    assert.equal(result.totalCalls, 0);
    assert.equal(result.totalDurationMs, 0);
    assert.equal(result.avgDurationMs, 0);
    assert.equal(result.calls.length, 0);
  });

  test('filters find by time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const inside = extractFind(loaded, {
      functionName: 'RunTask',
      timeRange: { startMs: 1050, endMs: 1200 },
    });
    assert.equal(inside.totalCalls, 1);

    const outside = extractFind(loaded, {
      functionName: 'RunTask',
      timeRange: { startMs: 0, endMs: 500 },
    });
    assert.equal(outside.totalCalls, 0);
  });
});
