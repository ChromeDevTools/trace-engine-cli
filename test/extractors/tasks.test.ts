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
import { extractTasks } from '../../src/engine/extractors/tasks.js';
import { loadTraceFromFile, parseTraceJson } from '../../src/engine/loader.js';

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
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].durationMs, 60);
    assert.equal(result.tasks[0].selfTimeMs, 60);
    assert.equal(result.tasks[0].functionName, 'RunTask');
  });

  test('extractTasks supports top-down tree', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractTasks(loaded, { tree: 'top-down' });
    assert.equal(result.mode, 'top-down');
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].durationMs, 60);
    assert.equal(result.tasks[0].selfTimeMs, 60);
    assert.equal(result.tasks[0].functionName, 'RunTask');
  });

  test('extractTasks extracts nested tasks and JS stack frames from navigation trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const listResult = extractTasks(loaded, { minDurationMs: 50 });
    assert.equal(listResult.mode, 'list');
    assert.equal(listResult.tasks.length, 2);

    // RunTask #1 (120ms) with child bootApp (70ms), Layout (20ms), and Paint (10ms).
    assert.equal(listResult.tasks[0].startTimeMs, 1400);
    assert.equal(listResult.tasks[0].durationMs, 120);
    assert.equal(listResult.tasks[0].selfTimeMs, 20);
    assert.equal(listResult.tasks[0].functionName, 'RunTask > bootApp');
    assert.equal(listResult.tasks[0].url, 'https://example.com/app.js');
    assert.equal(listResult.tasks[0].lineNumber, 42);
    assert.equal(listResult.tasks[0].columnNumber, 8);

    // RunTask #2 (60ms) with child MajorGC (25ms).
    assert.equal(listResult.tasks[1].startTimeMs, 2400);
    assert.equal(listResult.tasks[1].durationMs, 60);
    assert.equal(listResult.tasks[1].selfTimeMs, 35);
    assert.equal(listResult.tasks[1].functionName, 'RunTask > MajorGC');

    const bottomUpResult = extractTasks(loaded, { tree: 'bottom-up' });
    assert.equal(bottomUpResult.mode, 'bottom-up');
    assert.ok(bottomUpResult.tasks.length > 0);
    assert.equal(bottomUpResult.tasks[0].functionName, 'bootApp');
    assert.equal(bottomUpResult.tasks[0].startTimeMs, 1405);
    assert.equal(bottomUpResult.tasks[0].selfTimeMs, 70);
    assert.equal(bottomUpResult.tasks[0].durationMs, 70);
    assert.equal(bottomUpResult.tasks[0].url, 'https://example.com/app.js');
    assert.equal(bottomUpResult.tasks[0].lineNumber, 42);
    assert.equal(bottomUpResult.tasks[0].columnNumber, 8);
  });

  test('shows nested calls in the top-down tree and applies URL filtering before the limit', async () => {
    const loaded = await loadTraceFromFile(path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json'));
    const topDown = extractTasks(loaded, { tree: 'top-down' });
    assert.deepEqual(topDown.tasks.find((task) => task.functionName === 'bootApp')?.callPath, ['RunTask', 'bootApp']);

    const filtered = extractTasks(loaded, { tree: 'top-down', top: 1, urlOnly: true });
    assert.equal(filtered.tasks[0]?.url, 'https://example.com/app.js');
    assert.equal(filtered.tasks[0]?.functionName, 'bootApp');
  });

  test('preserves ranking ties and applies URL eligibility before the limit', async (t) => {
    const fixture = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const events = parseTraceJson(await readFile(fixture, 'utf8'));
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trace-cli-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'ranked-tasks.json');
    const runTask = { name: 'RunTask', cat: 'disabled-by-default-devtools.timeline', ph: 'X', pid: 100, tid: 1 };
    await writeFile(file, JSON.stringify([
      ...events,
      { ...runTask, ts: 5500000, dur: 180000 },
      { ...runTask, ts: 5800000, dur: 180001 },
      { ...runTask, ts: 6100000, dur: 180002 },
      { ...runTask, ts: 6400000, dur: 180003 },
    ]));

    const loaded = await loadTraceFromFile(file);
    const longest = extractTasks(loaded, { top: 2 });
    assert.deepEqual(longest.tasks.map((task) => task.startTimeMs), [5500, 5800]);

    const withUrl = extractTasks(loaded, { top: 1, urlOnly: true });
    assert.equal(withUrl.tasks[0]?.functionName, 'RunTask > bootApp');

    const bottomUp = extractTasks(loaded, { tree: 'bottom-up', top: 1, urlOnly: true });
    assert.equal(bottomUp.tasks[0]?.functionName, 'bootApp');
  });
});
