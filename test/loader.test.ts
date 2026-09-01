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
import { isGzipBuffer, loadTraceFromFile, parseTraceJson } from '../src/engine/loader.js';

describe('Trace Loader', () => {
  test('isGzipBuffer identifies gzip magic header', () => {
    const gzBuf = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
    const plainBuf = Buffer.from('[{"name":"test"}]');

    assert.equal(isGzipBuffer(gzBuf), true);
    assert.equal(isGzipBuffer(plainBuf), false);
  });

  test('parseTraceJson handles array and wrapped formats', () => {
    const arrayJson = '[{"name":"event1"}]';
    const wrappedJson = '{"traceEvents":[{"name":"event2"}]}';

    const arrayEvents = parseTraceJson(arrayJson);
    const wrappedEvents = parseTraceJson(wrappedJson);

    assert.equal(arrayEvents.length, 1);
    assert.equal(wrappedEvents.length, 1);
  });

  test('parseTraceJson rejects invalid JSON', () => {
    assert.throws(() => parseTraceJson('invalid json'), {
      message: /Failed to parse trace JSON/,
    });
  });

  test('parseTraceJson rejects non-trace objects', () => {
    assert.throws(() => parseTraceJson('{"foo":"bar"}'), {
      message: /Unrecognized trace format/,
    });
  });

  test('loadTraceFromFile loads uncompressed JSON fixture', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    assert.ok(loaded.parsedTrace);
    assert.ok(loaded.rawEvents.length > 0);
    assert.equal(loaded.parsedTrace.data.Meta.mainFrameURL, 'https://example.com/test');
  });

  test('loadTraceFromFile loads compressed .json.gz fixture', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json.gz');
    const loaded = await loadTraceFromFile(fixturePath);

    assert.ok(loaded.parsedTrace);
    assert.ok(loaded.rawEvents.length > 0);
    assert.equal(loaded.parsedTrace.data.Meta.mainFrameURL, 'https://example.com/test');
  });

  test('loadTraceFromFile loads wrapped JSON fixture', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/wrapped-trace.json');
    const loaded = await loadTraceFromFile(fixturePath);

    assert.ok(loaded.parsedTrace);
    assert.equal(loaded.parsedTrace.data.Meta.mainFrameURL, 'https://example.com/wrapped');
  });

  test('loadTraceFromFile throws when file is missing', async () => {
    await assert.rejects(() => loadTraceFromFile('/non/existent/path.json'), {
      message: /Trace file not found/,
    });
  });
});
