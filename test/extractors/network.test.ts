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

  test('extractNetwork extracts detailed waterfall timings on navigation trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNetwork(loaded);
    const docRequest = result.requests.find((r) => r.requestId === 'NAV_1');
    assert.ok(docRequest);
    assert.equal(docRequest.url, 'https://example.com/app');
    assert.equal(docRequest.mimeType, 'text/html');
    assert.equal(docRequest.transferSizeBytes, 12000);
    assert.equal(docRequest.timing.queueingMs, 0);
    assert.equal(docRequest.timing.dnsMs, 10);
    assert.equal(docRequest.timing.sslMs, 15);
    assert.equal(docRequest.timing.ttfbMs, 20);
    assert.equal(docRequest.timing.downloadMs, 30);
    assert.equal(docRequest.timing.totalDurationMs, 90);
  });

  test('extractNetwork filters by render-blocking status on navigation trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNetwork(loaded, { renderBlocking: true });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].url, 'https://example.com/styles.css');
    assert.equal(result.requests[0].renderBlocking, true);
    assert.equal(result.requests[0].transferSizeBytes, 4096);
  });

  test('extractNetwork resolves multi-hop initiator chain on navigation trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNetwork(loaded, {
      initiatorChain: 'https://example.com/font.woff2',
    });

    assert.ok(result.initiatorChain);
    assert.equal(result.initiatorChain.length, 3);

    // Hop 0: font.woff2 initiated by styles.css.
    assert.equal(result.initiatorChain[0].url, 'https://example.com/font.woff2');
    assert.equal(result.initiatorChain[0].initiatorUrl, 'https://example.com/styles.css');
    assert.equal(result.initiatorChain[0].type, 'font/woff2');

    // Hop 1: styles.css initiated by app.
    assert.equal(result.initiatorChain[1].url, 'https://example.com/styles.css');
    assert.equal(result.initiatorChain[1].initiatorUrl, 'https://example.com/app');
    assert.equal(result.initiatorChain[1].type, 'text/css');

    // Hop 2: app document request with no initiator.
    assert.equal(result.initiatorChain[2].url, 'https://example.com/app');
    assert.equal(result.initiatorChain[2].initiatorUrl, undefined);
    assert.equal(result.initiatorChain[2].type, 'text/html');
  });
});
