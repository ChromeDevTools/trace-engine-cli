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
import { formatToon } from '../../src/formatters/toon.js';

describe('TOON Formatter', () => {
  test('formatToon encodes primitive values and objects', () => {
    const data = {
      bounds: { minMs: 0, maxMs: 100, durationMs: 100 },
      url: 'https://example.com',
    };
    const output = formatToon(data);
    assert.ok(output.includes('bounds:'));
    assert.ok(output.includes('minMs: 0'));
    assert.ok(output.includes('url: "https://example.com"'));
  });

  test('formatToon encodes arrays compactly', () => {
    const data = {
      tasks: [
        { name: 'Task1', dur: 10 },
        { name: 'Task2', dur: 20 },
      ],
    };
    const output = formatToon(data);
    assert.ok(output.includes('tasks[2]{name,dur}:'));
    assert.ok(output.includes('Task1,10'));
    assert.ok(output.includes('Task2,20'));
  });
});
