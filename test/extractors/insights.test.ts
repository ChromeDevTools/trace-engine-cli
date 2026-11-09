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
import { extractInsights } from '../../src/engine/extractors/insights.js';
import { type LoadedTrace, loadTraceFromFile } from '../../src/engine/loader.js';

describe('Insights Extractor', () => {
  let loaded: LoadedTrace;

  before(async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    loaded = await loadTraceFromFile(fixturePath);
  });

  test('extractInsights returns structured insights result', () => {
    const result = extractInsights(loaded);
    assert.ok(result.thirdParties);
    assert.equal(result.thirdParties.length, 1);
    assert.equal(result.thirdParties[0].entityName, 'example.com');
    assert.equal(result.thirdParties[0].transferSizeBytes, 5000);
  });

  test('extractInsights routes to specific navigationId when specified', () => {
    const result = extractInsights(loaded, {
      navigationId: 'NAV_1',
    });
    assert.equal(result.navigationId, 'NAV_1');
    assert.ok(result.thirdParties);
    assert.equal(result.thirdParties.length, 1);
    assert.equal(result.thirdParties[0].entityName, 'example.com');
  });

  test('extractInsights adds warning when navigationId is not found', () => {
    const result = extractInsights(loaded, {
      navigationId: 'NON_EXISTENT_NAV_ID',
    });
    assert.equal(result.navigationId, 'NON_EXISTENT_NAV_ID');
    assert.ok(result.warnings);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /No insights found for navigation ID/);
    assert.equal(result.lcpBreakdown, undefined);
    assert.equal(result.inpBreakdown, undefined);
    assert.equal(result.clsCulprits, undefined);
    assert.equal(result.renderBlocking, undefined);
  });

  test('extractInsights parses LCP breakdown and render blocking resources for navigation-cwv-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const cwvLoaded = await loadTraceFromFile(fixturePath);
    const result = extractInsights(cwvLoaded);

    assert.deepEqual(result.lcpBreakdown, {
      totalLcpMs: 4150,
      ttfbMs: 65,
      loadDelayMs: 185,
      loadDurationMs: 900,
      renderDelayMs: 3000,
      lcpElement: 'IMG',
      lcpUrl: 'https://example.com/hero.jpg',
    });
    assert.deepEqual(result.renderBlocking, [
      {
        url: 'https://example.com/styles.css',
        durationMs: 100,
        transferSizeBytes: 4096,
      },
    ]);
    assert.ok(result.warnings);
    assert.ok(result.warnings.includes('High LCP element render delay: 3000ms.'));
    assert.ok(result.warnings.includes('1 render-blocking requests found.'));

    const lcpCategoryOnly = extractInsights(cwvLoaded, { category: 'lcp' });
    assert.deepEqual(lcpCategoryOnly.lcpBreakdown, result.lcpBreakdown);
    assert.equal(lcpCategoryOnly.renderBlocking, undefined);
    assert.equal(lcpCategoryOnly.thirdParties, undefined);
  });

  test('extractInsights parses INP breakdown for interaction-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/interaction-trace.json');
    const interactionLoaded = await loadTraceFromFile(fixturePath);
    const result = extractInsights(interactionLoaded);

    assert.deepEqual(result.inpBreakdown, {
      totalDurationMs: 250,
      inputDelayMs: 5,
      processingDurationMs: 200,
      presentationDelayMs: 45,
      eventType: 'click',
      target: 'BUTTON',
    });
    assert.ok(result.warnings);
    assert.ok(
      result.warnings.includes('Longest interaction (click) exceeded 200ms threshold: 250ms.'),
    );
  });

  test('extractInsights parses CLS culprits for shifts-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const shiftsLoaded = await loadTraceFromFile(fixturePath);
    const result = extractInsights(shiftsLoaded);

    assert.deepEqual(result.clsCulprits, [
      {
        score: 0.15,
        timestampMs: 1300,
        culpritNodes: ['Node #42'],
      },
    ]);
  });
});
