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
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { before, describe, type TestContext } from 'node:test';
import { extractInsights } from '../../src/engine/extractors/insights.js';
import { extractOverview } from '../../src/engine/extractors/overview.js';
import { getPropertyByPath } from '../../src/engine/helpers.js';
import { type LoadedTrace, loadTraceFromFile, parseTraceJson } from '../../src/engine/loader.js';

async function loadCwvVariant(t: TestContext, update: (events: unknown[]) => unknown[]) {
  const fixture = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
  const events = parseTraceJson(await readFile(fixture, 'utf8'));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trace-cwv-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'trace.json');
  await writeFile(file, JSON.stringify(update(events)));
  return loadTraceFromFile(file);
}

function updateDocumentRequest(
  events: unknown[],
  eventName: string,
  update: (data: Record<string, unknown>) => void,
) {
  for (const event of events) {
    if (getPropertyByPath(event, 'name') !== eventName) continue;
    if (getPropertyByPath(event, 'args.data.requestId') !== 'NAV_1') continue;
    const data = getPropertyByPath(event, 'args.data');
    assert.ok(data && typeof data === 'object');
    update(data as Record<string, unknown>);
  }
  return events;
}

describe('Insights Extractor', () => {
  let loaded: LoadedTrace;

  before(async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/basic-trace.json');
    loaded = await loadTraceFromFile(fixturePath);
  });

  test('extractInsights returns structured insights result', () => {
    const result = extractInsights(loaded);
    assert.equal(result.navigationId, 'NAV_1');
    assert.equal(result.insightSetId, 'NAVIGATION_0');
    assert.equal(result.lcpBreakdown, undefined);
    assert.equal(result.thirdParties, undefined);
  });

  test('extractInsights routes to specific navigationId when specified', () => {
    const result = extractInsights(loaded, {
      navigationId: 'NAVIGATION_0',
    });
    assert.equal(result.navigationId, 'NAV_1');
    assert.equal(result.insightSetId, 'NAVIGATION_0');
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

  test('uses the same default navigation across paint metrics and CLS insights', async (t) => {
    function shift(ts: number, selector: string) {
      return {
        name: 'LayoutShift',
        cat: 'loading',
        ph: 'I',
        pid: 100,
        tid: 1,
        ts,
        args: {
          frame: 'FRAME_0',
          data: {
            is_main_frame: true,
            had_recent_input: false,
            score: 0.15,
            weighted_score_delta: 0.15,
            impacted_nodes: [{ node_id: 42, selector }],
          },
        },
      };
    }
    const trace = await loadCwvVariant(t, (events) => {
      const navIndex = events.findIndex(
        (event) => getPropertyByPath(event, 'name') === 'navigationStart',
      );
      assert.ok(navIndex >= 0);
      events.splice(
        navIndex,
        0,
        {
          name: 'navigationStart',
          cat: 'blink.user_timing',
          ph: 'R',
          pid: 100,
          tid: 1,
          ts: 1010000,
          args: {
            frame: 'FRAME_0',
            data: {
              documentLoaderURL: 'https://example.com/earlier',
              navigationId: 'NAV_EARLY',
              isOutermostMainFrame: true,
              isInPrimaryMainFrame: true,
            },
          },
        },
        {
          name: 'firstContentfulPaint',
          cat: 'loading,rail,devtools.timeline',
          ph: 'R',
          pid: 100,
          tid: 1,
          ts: 1025000,
          args: { frame: 'FRAME_0', data: { navigationId: 'NAV_EARLY' } },
        },
        shift(1030000, '#early'),
      );
      return [...events, shift(1475000, '#selected')];
    });

    const insights = extractInsights(trace);
    assert.equal(insights.navigationId, 'NAV_1');
    assert.equal(insights.clsCulprits?.length, 1);
    assert.deepEqual(insights.clsCulprits[0].culpritNodes, ['#selected']);
    const earlier = extractInsights(trace, { navigationId: 'NAV_EARLY' });
    assert.equal(earlier.clsCulprits?.length, 1);
    assert.deepEqual(earlier.clsCulprits[0].culpritNodes, ['#early']);

    const { fcp, lcp } = extractOverview(trace).coreWebVitals;
    assert.equal(fcp?.valueMs, 2050);
    assert.equal(lcp?.valueMs, 4150);
  });

  test('keeps measured LCP when document request timing is missing', async (t) => {
    const trace = await loadCwvVariant(t, (events) =>
      events.filter((event) => getPropertyByPath(event, 'args.data.requestId') !== 'NAV_1'),
    );
    const result = extractInsights(trace, { category: 'lcp' });
    assert.equal(result.lcpBreakdown?.totalLcpMs, 4150);
    assert.equal(result.lcpBreakdown?.ttfbMs, null);
    assert.equal(result.lcpBreakdown?.loadDelayMs, null);
    assert.equal(result.lcpBreakdown?.loadDurationMs, null);
    assert.equal(result.lcpBreakdown?.renderDelayMs, null);
    assert.match(result.warnings?.join('\n') ?? '', /LCP was measured.*no timing breakdown/);
  });

  test('reports third-party requests and excludes first-party requests', async (t) => {
    const trace = await loadCwvVariant(t, (events) =>
      parseTraceJson(
        JSON.stringify(events).replaceAll(
          'https://example.com/font.woff2',
          'https://cdn.example.net/font.woff2',
        ),
      ),
    );
    const result = extractInsights(trace, { category: 'third-parties' });
    assert.equal(result.thirdParties?.length, 1);
    assert.match(result.thirdParties[0].entityName, /example\.net/);
    assert.equal(result.thirdParties[0].transferSizeBytes, 16384);
  });

  test('lists the state of every insight model, failing models first', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const result = extractInsights(await loadTraceFromFile(fixturePath));
    assert.ok(result.models);

    assert.deepEqual(
      result.models.find((model) => model.key === 'LCPBreakdown'),
      { key: 'LCPBreakdown', title: 'LCP breakdown', state: 'fail' },
    );
    assert.deepEqual(
      result.models.find((model) => model.key === 'RenderBlocking'),
      { key: 'RenderBlocking', title: 'Render-blocking requests', state: 'fail' },
    );

    const rank = { fail: 0, informative: 1, pass: 2 };
    const ranks = result.models.map((model) => rank[model.state]);
    assert.ok(ranks.includes(rank.pass));
    assert.deepEqual(
      ranks,
      [...ranks].sort((a, b) => a - b),
    );
  });

  test('reports metric savings in milliseconds and wasted bytes', async (t) => {
    const trace = await loadCwvVariant(t, (events) => {
      updateDocumentRequest(events, 'ResourceReceiveResponse', (data) => {
        data.timing = {
          ...(data.timing as Record<string, unknown>),
          receiveHeadersStart: 740,
          receiveHeadersEnd: 745,
        };
      });
      return updateDocumentRequest(events, 'ResourceFinish', (data) => {
        data.decodedBodyLength = 30000;
      });
    });
    const result = extractInsights(trace);

    assert.deepEqual(
      result.models?.find((model) => model.key === 'DocumentLatency'),
      {
        key: 'DocumentLatency',
        title: 'Document request latency',
        state: 'fail',
        metricSavings: { fcpMs: 600, lcpMs: 600 },
        wastedBytes: 20100,
      },
    );
  });

  test('reports insight models that failed to compute as warnings', async (t) => {
    const trace = await loadCwvVariant(t, (events) =>
      updateDocumentRequest(events, 'ResourceReceiveResponse', (data) => {
        delete data.timing;
      }),
    );
    const result = extractInsights(trace);

    assert.equal(
      result.models?.find((model) => model.key === 'DocumentLatency'),
      undefined,
    );
    assert.ok(
      result.warnings?.includes(
        'DocumentLatency insight could not be computed: missing document request timing',
      ),
    );
  });

  test('omits the model list when a category is selected', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/navigation-cwv-trace.json');
    const result = extractInsights(await loadTraceFromFile(fixturePath), { category: 'lcp' });
    assert.equal(result.models, undefined);
  });

  test('extractInsights parses CLS culprits for shifts-trace', async () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/shifts-trace.json');
    const shiftsLoaded = await loadTraceFromFile(fixturePath);
    const result = extractInsights(shiftsLoaded);

    assert.deepEqual(result.clsCulprits, [
      {
        score: 0.15,
        timestampMs: 1300,
        culpritNodes: ['#banner'],
      },
    ]);
  });
});
