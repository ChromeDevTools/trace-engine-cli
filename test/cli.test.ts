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
import { runCli } from '../src/cli.js';

async function captureCliOutput(args: string[]): Promise<string> {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => {
    logs.push(msg);
  };
  try {
    await runCli(args);
    return logs.join('\n');
  } finally {
    console.log = origLog;
  }
}

describe('CLI Dispatcher', () => {
  test('runs overview command by default for a trace file', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput(['node', 'trace-cli', fixturePath]);
    assert.ok(output.includes('bounds:'));
    assert.ok(output.includes('https://example.com/test'));
    assert.ok(output.includes('Drill-down commands:'));
  });

  test('runs explicit overview command in markdown mode', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'overview',
      fixturePath,
      '--format',
      'md',
    ]);
    assert.ok(output.includes('# Trace Overview'));
    assert.ok(output.includes('## Core Web Vitals'));
    assert.ok(output.includes('## Main Thread Time Breakdown'));
  });

  test('runs tasks subcommand with relative time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'tasks',
      fixturePath,
      '--min-duration',
      '10',
      '--time-range',
      '50ms,150ms',
    ]);
    assert.ok(output.includes('tasks[1]{'));
    assert.ok(output.includes('RunTask'));
  });

  test('runs find subcommand with unit-suffixed relative time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'find',
      fixturePath,
      '--function',
      'RunTask',
      '--time-range',
      '0.05s,0.2s',
    ]);
    assert.ok(output.includes('functionQuery: RunTask'));
    assert.ok(output.includes('totalCalls: 1'));
  });

  test('runs profile subcommand with relative range and bucket units', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'profile',
      fixturePath,
      '--time-range',
      '0ms,150ms',
      '--bucket',
      '50ms',
    ]);
    assert.ok(output.includes('bucketSizeMs: 50'));
    assert.ok(output.includes('buckets'));
  });

  test('runs diff subcommand comparing relative windows', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'diff',
      fixturePath,
      '--window-a',
      '0,50ms',
      '--window-b',
      '50ms,160ms',
    ]);
    assert.ok(output.includes('windowA:'));
    assert.ok(output.includes('windowB:'));
    assert.ok(output.includes('RunTask'));
  });

  test('runs diff subcommand with --absolute-timestamps', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'diff',
      fixturePath,
      '--window-a',
      '1000,1050',
      '--window-b',
      '1050,1160',
      '--absolute-timestamps',
    ]);
    assert.ok(output.includes('windowA:'));
    assert.ok(output.includes('windowB:'));
    assert.ok(output.includes('RunTask'));
  });

  test('runs scheduling subcommand', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/scheduling-trace.json');
    const output = await captureCliOutput(['node', 'trace-cli', 'scheduling', fixturePath]);
    assert.ok(output.includes('animationFrames:'));
    assert.ok(output.includes('timers:'));
  });

  test('runs network subcommand', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput(['node', 'trace-cli', 'network', fixturePath]);
    assert.ok(output.includes('requests[1]{'));
    assert.ok(output.includes('https://example.com/test'));
  });

  test('runs events subcommand with name and field filtering', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/shifts-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'events',
      fixturePath,
      '--name',
      'LayoutShift',
      '--fields',
      'args.data.navigationId,args.data.score',
    ]);
    assert.ok(output.includes('LayoutShift'));
    assert.ok(output.includes('args.data.navigationId'));
    assert.ok(output.includes('NAV_1'));
  });

  test('runs navigations subcommand and navs alias', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const navOutput = await captureCliOutput(['node', 'trace-cli', 'navigations', fixturePath]);
    assert.ok(navOutput.includes('NAV_1'));
    assert.ok(navOutput.includes('https://example.com/test'));

    const aliasOutput = await captureCliOutput(['node', 'trace-cli', 'navs', fixturePath]);
    assert.ok(aliasOutput.includes('NAV_1'));
    assert.ok(aliasOutput.includes('https://example.com/test'));
  });

  test('runs shifts subcommand with --events flag', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/shifts-trace.json');
    const output = await captureCliOutput(['node', 'trace-cli', 'shifts', fixturePath, '--events']);
    assert.ok(output.includes('NAV_1'));
    assert.ok(output.includes('banner-ad'));
  });

  test('runs insights subcommand with --navigation flag', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'insights',
      fixturePath,
      '--navigation',
      'NAV_1',
    ]);
    assert.ok(output.includes('navigationId: NAV_1'));
  });

  test('runs scan subcommand in default toon mode', async () => {
    const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'scan',
      fixturesDir,
      '--name',
      'LayoutShift',
    ]);
    assert.ok(output.includes('totalFilesScanned:'));
    assert.ok(output.includes('totalFilesMatched: 1'));
    assert.ok(output.includes('shifts-trace.json'));
  });

  test('runs scan subcommand in markdown mode', async () => {
    const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
    const output = await captureCliOutput([
      'node',
      'trace-cli',
      'scan',
      fixturesDir,
      '--grep',
      'FRAME_0',
      '--format',
      'md',
    ]);
    assert.ok(output.includes('# Trace Scan Results'));
    assert.ok(output.includes('basic-trace.json'));
  });

  test('rejects multiple files on single-file command with scan hint', async () => {
    const file1 = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const file2 = path.resolve(import.meta.dirname, 'fixtures/shifts-trace.json');
    await assert.rejects(async () => {
      await captureCliOutput(['node', 'trace-cli', 'events', file1, file2]);
    }, /Command accepts only a single trace file\. Received multiple files\. To search across multiple files or directories, use:\n {2}trace-cli scan <dir-or-glob>/);
  });

  test('rejects directory on single-file command with scan hint', async () => {
    const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
    await assert.rejects(async () => {
      await captureCliOutput(['node', 'trace-cli', 'events', fixturesDir]);
    }, /is a directory\. Trace engine commands accept a single trace file\. To search across multiple files or directories, use: trace-cli scan/);
  });
});
