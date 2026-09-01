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
  test('extractOverview parses metadata and main thread stats', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);
    const overview = extractOverview(loaded);

    assert.equal(overview.mainUrl, 'https://example.com/test');
    assert.equal(overview.bounds.durationMs, 160);
    assert.equal(overview.navigationStartMs, 1050);
    assert.ok(overview.mainThreadBreakdown.totalMs >= 0);
  });
});
