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
import test, { before, describe } from 'node:test';
import { extractEvents } from '../../src/engine/extractors/events.js';
import { type LoadedTrace, loadTraceFromFile } from '../../src/engine/loader.js';

describe('Events Extractor', () => {
  let loaded: LoadedTrace;

  before(async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    loaded = await loadTraceFromFile(fixturePath);
  });

  test('extracts all events when no filters are specified', () => {
    const result = extractEvents(loaded);
    assert.equal(result.totalMatched, 7);
    assert.equal(result.returned, 7);
    assert.equal(result.events.length, 7);
    assert.equal(result.events[0].name, 'process_name');
  });

  test('filters events by single event name', () => {
    const result = extractEvents(loaded, { names: ['LayoutShift'] });
    assert.equal(result.totalMatched, 1);
    assert.equal(result.returned, 1);
    assert.equal(result.events[0].name, 'LayoutShift');
    assert.equal(result.events[0].tsMs, 1300);
    assert.equal(result.events[0].cat, 'loading');
    assert.equal(result.events[0].ph, 'I');
  });

  test('filters events by multiple comma-separated event names', () => {
    const result = extractEvents(loaded, {
      names: ['LayoutShift', 'TracingStartedInBrowser'],
    });
    assert.equal(result.totalMatched, 2);
    assert.equal(result.returned, 2);
    assert.equal(result.events[0].name, 'TracingStartedInBrowser');
    assert.equal(result.events[1].name, 'LayoutShift');
  });

  test('filters events by category', () => {
    const result = extractEvents(loaded, { category: 'loading' });
    assert.equal(result.totalMatched, 1);
    assert.equal(result.events[0].name, 'LayoutShift');
  });

  test('filters events by phase', () => {
    const result = extractEvents(loaded, { phase: 'M' });
    assert.equal(result.totalMatched, 4);
  });

  test('extracts specific dot-notation fields', () => {
    const result = extractEvents(loaded, {
      names: ['LayoutShift'],
      fields: ['args.data.navigationId', 'args.data.score', 'cat', 'args.data.nonexistent'],
    });
    assert.equal(result.events.length, 1);
    const ev = result.events[0];
    assert.ok(ev.selectedFields);
    assert.equal(ev.selectedFields['args.data.navigationId'], 'NAV_1');
    assert.equal(ev.selectedFields['args.data.score'], 0.15);
    assert.equal(ev.selectedFields.cat, 'loading');
    assert.equal(ev.selectedFields['args.data.nonexistent'], undefined);
  });

  test('returns empty events when no events match query', () => {
    const result = extractEvents(loaded, { names: ['NonExistentEvent'] });
    assert.equal(result.totalMatched, 0);
    assert.equal(result.returned, 0);
    assert.equal(result.events.length, 0);
  });

  test('respects limit threshold', () => {
    const result = extractEvents(loaded, { limit: 2 });
    assert.equal(result.totalMatched, 7);
    assert.equal(result.returned, 2);
    assert.equal(result.events.length, 2);
  });

  test('filters events by time range', () => {
    const result = extractEvents(loaded, {
      timeRange: { startMs: 1200, endMs: 1400 },
    });
    assert.equal(result.totalMatched, 1);
    assert.equal(result.events[0].name, 'LayoutShift');
  });
});
