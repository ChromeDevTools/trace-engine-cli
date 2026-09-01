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
import { extractTasks } from '../../src/engine/extractors/tasks.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Tasks Extractor', () => {
  test('extractTasks extracts top-level tasks above threshold', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractTasks(loaded, { minDurationMs: 50 });
    assert.equal(result.mode, 'list');
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].durationMs, 60);
    assert.equal(result.tasks[0].functionName, 'RunTask');
  });

  test('extractTasks filters out tasks below threshold', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractTasks(loaded, { minDurationMs: 100 });
    assert.equal(result.tasks.length, 0);
  });

  test('extractTasks supports bottom-up tree', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractTasks(loaded, { tree: 'bottom-up' });
    assert.equal(result.mode, 'bottom-up');
    assert.ok(result.tasks.length > 0);
  });

  test('extractTasks supports top-down tree', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractTasks(loaded, { tree: 'top-down' });
    assert.equal(result.mode, 'top-down');
    assert.ok(result.tasks.length > 0);
  });
});
