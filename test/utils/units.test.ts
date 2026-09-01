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
  formatBytes,
  formatMs,
  formatScore,
  microToMilli,
  milliToMicro,
  round,
} from '../../src/utils/units.js';

describe('Units Utilities', () => {
  test('microToMilli converts microseconds to milliseconds', () => {
    assert.equal(microToMilli(1000), 1);
    assert.equal(microToMilli(5500), 5.5);
    assert.equal(microToMilli(0), 0);
  });

  test('milliToMicro converts milliseconds to microseconds', () => {
    assert.equal(milliToMicro(1), 1000);
    assert.equal(milliToMicro(2.5), 2500);
  });

  test('round rounds to given decimal places', () => {
    assert.equal(round(123.4567, 2), 123.46);
    assert.equal(round(123.4567, 0), 123);
    assert.equal(round(123.4567, 4), 123.4567);
  });

  test('formatMs formats milliseconds with ms suffix', () => {
    assert.equal(formatMs(12.3456), '12.35ms');
    assert.equal(formatMs(0), '0ms');
  });

  test('formatBytes formats byte sizes appropriately', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(1048576), '1 MB');
    assert.equal(formatBytes(1073741824), '1 GB');
    assert.equal(formatBytes(1099511627776), '1 TB');
    assert.equal(formatBytes(-1024), '-1 KB');
  });

  test('formatScore formats decimal score string', () => {
    assert.equal(formatScore(0.01234), '0.0123');
    assert.equal(formatScore(0), '0');
  });
});
