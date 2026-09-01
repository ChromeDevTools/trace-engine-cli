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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { resolveScanTargets, scanTraces } from '../../src/engine/extractors/scan.js';

describe('Scan Extractor', () => {
  const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

  test('resolves directory to trace files recursively', () => {
    const files = resolveScanTargets([fixturesDir]);
    assert.ok(files.length >= 6);
    assert.ok(files.every((f) => f.endsWith('.json') || f.endsWith('.json.gz')));
  });

  test('resolves glob pattern to matching trace files', () => {
    const globPattern = path.join(fixturesDir, '*.json.gz');
    const files = resolveScanTargets([globPattern]);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('basic-trace.json.gz'));
  });

  test('resolves explicit list of trace file paths', () => {
    const file1 = path.join(fixturesDir, 'basic-trace.json');
    const file2 = path.join(fixturesDir, 'shifts-trace.json');
    const files = resolveScanTargets([file1, file2]);
    assert.equal(files.length, 2);
    assert.equal(files[0], file1);
    assert.equal(files[1], file2);
  });

  test('throws error when target path does not exist', () => {
    assert.throws(
      () => resolveScanTargets(['non-existent-directory-xyz']),
      /Target path not found: non-existent-directory-xyz/,
    );
  });

  test('throws error when multiple targets include a non-existent path', () => {
    assert.throws(
      () => resolveScanTargets([fixturesDir, 'non-existent-directory-xyz']),
      /Target path not found: non-existent-directory-xyz/,
    );
  });

  test('throws error when glob matches no trace files', () => {
    assert.throws(
      () => resolveScanTargets(['non-existent-glob-dir/*.json']),
      /No trace files \(\.json, \.json\.gz\) found matching targets/,
    );
  });

  test('throws error when no search filters are specified', () => {
    assert.throws(
      () => scanTraces({ targets: [fixturesDir] }),
      /At least one search filter must be specified/,
    );
  });

  test('scans directory and matches specific event name', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      names: ['LayoutShift'],
    });

    assert.equal(result.totalFilesScanned >= 6, true);
    assert.equal(result.totalFilesMatched, 1);
    assert.equal(result.matchedFiles.length, 1);
    assert.ok(result.matchedFiles[0].file.includes('shifts-trace.json'));
    assert.equal(result.matchedFiles[0].firstEventName, 'LayoutShift');
    assert.equal(result.matchedFiles[0].matchCount, 1);
    assert.equal(result.totalEventsMatched, 1);
  });

  test('scans directory and matches multiple union event names', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      names: ['LayoutShift', 'TimerInstall'],
    });

    assert.equal(result.totalFilesMatched, 2);
    assert.equal(result.matchedFiles.length, 2);
  });

  test('scans directory by event category', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      category: '__metadata',
    });

    assert.ok(result.totalFilesMatched >= 2);
    assert.ok(result.matchedFiles.some((f) => f.file.includes('basic-trace.json')));
  });

  test('scans directory by phase code', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      names: ['process_name'],
      phase: 'M',
    });

    assert.ok(result.totalFilesMatched >= 2);
    assert.ok(result.matchedFiles.every((f) => f.categories.includes('__metadata')));
  });

  test('scans directory using raw text substring grep', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      grep: 'FRAME_0',
    });

    assert.ok(result.totalFilesMatched >= 1);
    assert.ok(result.matchedFiles.some((f) => f.file.includes('basic-trace.json')));
  });

  test('scans directory checking field existence', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      names: ['TracingStartedInBrowser'],
      fields: ['args.data.frames'],
    });

    assert.ok(result.totalFilesMatched >= 1);
    assert.ok(result.matchedFiles.some((f) => f.file.includes('basic-trace.json')));
  });

  test('returns 0 matches when criteria do not match any file', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      names: ['NonExistentEventName12345'],
    });

    assert.equal(result.totalFilesMatched, 0);
    assert.equal(result.totalEventsMatched, 0);
    assert.equal(result.matchedFiles.length, 0);
  });

  test('respects limit threshold on matched files', () => {
    const result = scanTraces({
      targets: [fixturesDir],
      category: '__metadata',
      limit: 1,
    });

    assert.ok(result.totalFilesMatched > 1);
    assert.equal(result.matchedFiles.length, 1);
  });

  test('scans directory matching comma-delimited composite category', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-scan-test-'));
    try {
      const traceFile = path.join(tempDir, 'composite.json');
      fs.writeFileSync(
        traceFile,
        JSON.stringify([
          { name: 'CompositeEvent', cat: 'blink,devtools.timeline', ph: 'X', ts: 1000 },
        ]),
      );

      const result = scanTraces({
        targets: [tempDir],
        category: 'devtools.timeline',
      });

      assert.equal(result.totalFilesMatched, 1);
      assert.equal(result.matchedFiles[0].firstEventName, 'CompositeEvent');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('does not produce false positives when searching for brace in event without args', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-scan-test-'));
    try {
      const traceFile = path.join(tempDir, 'no-args.json');
      fs.writeFileSync(
        traceFile,
        JSON.stringify([{ name: 'PlainEvent', cat: 'v8', ph: 'X', ts: 1000 }]),
      );

      const result = scanTraces({
        targets: [tempDir],
        grep: '{',
      });

      assert.equal(result.totalFilesMatched, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
