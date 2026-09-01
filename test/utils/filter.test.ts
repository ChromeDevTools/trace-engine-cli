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
import {
  isEventInBounds,
  isTimestampInBounds,
  parseTimeRange,
  parseTimeValue,
  resolveTimeRange,
} from '../../src/utils/filter.js';

describe('Filter Utilities', () => {
  test('parseTimeValue parses values with units', () => {
    assert.equal(parseTimeValue('100'), 100);
    assert.equal(parseTimeValue('100ms'), 100);
    assert.equal(parseTimeValue('3.5s'), 3500);
    assert.equal(parseTimeValue('5000us'), 5);
    assert.equal(parseTimeValue('5000µs'), 5);
  });

  test('parseTimeValue throws on invalid values', () => {
    assert.throws(() => parseTimeValue('abc'), {
      message: /Invalid time value/,
    });
  });

  test('parseTimeRange returns undefined for empty input', () => {
    assert.equal(parseTimeRange(undefined), undefined);
    assert.equal(parseTimeRange(''), undefined);
    assert.equal(parseTimeRange('   '), undefined);
  });

  test('parseTimeRange parses comma, colon, dotdot, and dash separated ranges', () => {
    assert.deepEqual(parseTimeRange('100,500'), { startMs: 100, endMs: 500 });
    assert.deepEqual(parseTimeRange('100:500'), { startMs: 100, endMs: 500 });
    assert.deepEqual(parseTimeRange('100-500'), { startMs: 100, endMs: 500 });
    assert.deepEqual(parseTimeRange('3.5s,4.2s'), { startMs: 3500, endMs: 4200 });
    assert.deepEqual(parseTimeRange('3500ms..4200ms'), { startMs: 3500, endMs: 4200 });
  });

  test('parseTimeRange throws on invalid formats or values', () => {
    assert.throws(() => parseTimeRange('100'), {
      message: /Invalid time range format/,
    });
    assert.throws(() => parseTimeRange('abc,def'), {
      message: /Invalid time value/,
    });
    assert.throws(() => parseTimeRange('500,100'), {
      message: /Invalid time range values/,
    });
  });

  test('resolveTimeRange resolves relative timestamps by default', () => {
    // Trace bounds: 10,000,000us to 15,000,000us (10,000ms to 15,000ms, duration = 5,000ms)
    const bounds = { min: 10000000, max: 15000000 };

    const resolved = resolveTimeRange({ startMs: 500, endMs: 2000 }, bounds, false);
    assert.deepEqual(resolved, { startMs: 10500, endMs: 12000 });
  });

  test('resolveTimeRange resolves absolute timestamps when isAbsolute is true', () => {
    const bounds = { min: 10000000, max: 15000000 };

    const resolved = resolveTimeRange({ startMs: 10500, endMs: 12000 }, bounds, true);
    assert.deepEqual(resolved, { startMs: 10500, endMs: 12000 });
  });

  test('resolveTimeRange throws actionable error for out-of-bounds relative ranges', () => {
    // Trace duration is 5000ms
    const bounds = { min: 10000000, max: 15000000 };

    assert.throws(() => resolveTimeRange({ startMs: 6000, endMs: 8000 }, bounds, false), {
      message: /outside trace duration.*Did you mean to add --absolute-timestamps\?/,
    });
  });

  test('resolveTimeRange throws actionable error for out-of-bounds absolute ranges', () => {
    const bounds = { min: 10000000, max: 15000000 };

    assert.throws(() => resolveTimeRange({ startMs: 100, endMs: 500 }, bounds, true), {
      message: /outside trace bounds.*Did you mean to omit --absolute-timestamps\?/,
    });
  });

  test('isTimestampInBounds checks timestamp boundaries', () => {
    const range = { startMs: 100, endMs: 200 };
    assert.equal(isTimestampInBounds(150, range), true);
    assert.equal(isTimestampInBounds(100, range), true);
    assert.equal(isTimestampInBounds(200, range), true);
    assert.equal(isTimestampInBounds(50, range), false);
    assert.equal(isTimestampInBounds(250, range), false);
    assert.equal(isTimestampInBounds(150), true);
  });

  test('isEventInBounds checks event overlaps with time range', () => {
    const range = { startMs: 100, endMs: 200 };
    assert.equal(isEventInBounds(150, 20, range), true);
    assert.equal(isEventInBounds(50, 60, range), true);
    assert.equal(isEventInBounds(190, 50, range), true);
    assert.equal(isEventInBounds(50, 10, range), false);
    assert.equal(isEventInBounds(250, 10, range), false);
    assert.equal(isEventInBounds(150, 20), true);
  });
});
