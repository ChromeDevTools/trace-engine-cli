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
import { extractNetwork } from '../../src/engine/extractors/network.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Network Extractor', () => {
  test('extractNetwork extracts requests and timings', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNetwork(loaded);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].url, 'https://example.com/test');
    assert.equal(result.requests[0].mimeType, 'text/html');
    assert.equal(result.requests[0].transferSizeBytes, 5000);
  });

  test('extractNetwork filters by time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const inside = extractNetwork(loaded, {
      timeRange: { startMs: 1000, endMs: 1200 },
    });
    assert.equal(inside.requests.length, 1);

    const outside = extractNetwork(loaded, {
      timeRange: { startMs: 0, endMs: 500 },
    });
    assert.equal(outside.requests.length, 0);
  });

  test('extractNetwork finds initiator chain when present', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNetwork(loaded, {
      initiatorChain: 'https://example.com/test',
    });
    assert.ok(result.initiatorChain);
    assert.equal(result.initiatorChain.length, 1);
    assert.equal(result.initiatorChain[0].url, 'https://example.com/test');
  });
});
