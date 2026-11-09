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
import { extractOverview } from '../../src/engine/extractors/overview.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Overview Extractor', () => {
  test('extractOverview parses metadata and main thread stats for basic-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);
    const overview = extractOverview(loaded);

    assert.equal(overview.bounds.minMs, 1000);
    assert.equal(overview.bounds.maxMs, 1160);
    assert.equal(overview.bounds.durationMs, 160);
    assert.equal(overview.mainUrl, 'https://example.com/test');
    assert.equal(overview.navigationStartMs, 1050);
    assert.deepEqual(overview.mainThreadBreakdown, {
      systemMs: 60,
      idleMs: 100,
      scriptingMs: 0,
      layoutMs: 0,
      renderingMs: 0,
      gcMs: 0,
      totalMs: 160,
    });
  });

  test('extractOverview parses core web vitals and warnings for navigation-cwv-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);
    const overview = extractOverview(loaded);

    assert.deepEqual(overview.coreWebVitals.fcp, {
      valueMs: 2050,
      rating: 'needs-improvement',
    });
    assert.deepEqual(overview.coreWebVitals.lcp, {
      valueMs: 4150,
      rating: 'poor',
      element: 'IMG',
      url: 'https://example.com/hero.jpg',
    });
    assert.ok(
      overview.warnings.includes('Poor Largest Contentful Paint: 4150ms (threshold: 2500ms)'),
    );
    assert.ok(overview.warnings.includes('1 render-blocking resource(s) detected.'));
    assert.deepEqual(overview.mainThreadBreakdown, {
      scriptingMs: 70,
      layoutMs: 20,
      renderingMs: 10,
      gcMs: 25,
      systemMs: 65,
      idleMs: 4010,
      totalMs: 4200,
    });
    const activeAndIdleSum =
      overview.mainThreadBreakdown.scriptingMs +
      overview.mainThreadBreakdown.layoutMs +
      overview.mainThreadBreakdown.renderingMs +
      overview.mainThreadBreakdown.gcMs +
      overview.mainThreadBreakdown.systemMs +
      overview.mainThreadBreakdown.idleMs;
    assert.equal(activeAndIdleSum, overview.mainThreadBreakdown.totalMs);
  });

  test('extractOverview parses interaction-to-next-paint for interaction-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/interaction-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);
    const overview = extractOverview(loaded);

    assert.deepEqual(overview.coreWebVitals.inp, {
      valueMs: 250,
      rating: 'needs-improvement',
      interactionType: 'click',
    });
  });

  test('extractOverview parses cumulative layout shift for shifts-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);
    const overview = extractOverview(loaded);

    assert.deepEqual(overview.coreWebVitals.cls, {
      value: 0.15,
      rating: 'needs-improvement',
      worstClusterScore: 0.15,
    });
  });
});
