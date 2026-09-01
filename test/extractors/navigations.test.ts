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
import { extractNavigations } from '../../src/engine/extractors/navigations.js';
import { loadTraceFromFile } from '../../src/engine/loader.js';

describe('Navigations Extractor', () => {
  test('extracts navigation entries and insight set mappings', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNavigations(loaded);
    assert.equal(result.total, 1);
    assert.equal(result.navigations.length, 1);

    const nav = result.navigations[0];
    assert.equal(nav.navigationId, 'NAV_1');
    assert.equal(nav.url, 'https://example.com/test');
    assert.equal(nav.timestampMs, 1050);
    assert.equal(nav.isMainFrame, true);
    assert.equal(nav.hasInsights, true);
    assert.equal(nav.insightSetId, 'NAVIGATION_0');

    assert.equal(result.insightSetIds.length, 1);
    assert.equal(result.insightSetIds[0], 'NAVIGATION_0');
  });

  test('handles traces without navigations gracefully', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/scheduling-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    const result = extractNavigations(loaded);
    assert.equal(result.total, 0);
    assert.equal(result.navigations.length, 0);
    assert.ok(Array.isArray(result.insightSetIds));
  });
});
