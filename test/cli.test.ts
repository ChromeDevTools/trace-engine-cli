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
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { decode } from '@toon-format/toon';
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
  test('emits parseable JSON from the default overview command', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const args = ['node', 'trace-engine-cli', fixture, '--format', 'json'];
    const output = await captureCliOutput(args);
    const result: unknown = JSON.parse(output);

    assert.ok(result && typeof result === 'object' && 'mainUrl' in result);
    assert.equal(result.mainUrl, 'https://example.com/test');
  });

  test('runs overview command by default for a trace file', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput(['node', 'trace-engine-cli', fixturePath]);
    assert.ok(output.includes('bounds:'));
    assert.ok(output.includes('https://example.com/test'));
    assert.ok(output.includes('Drill-down commands:'));
    assert.doesNotMatch(output, /No main page frame found/);
  });

  test('runs explicit overview command in markdown mode', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'overview',
      fixturePath,
      '--format',
      'md',
    ]);
    assert.ok(output.includes('# Trace Overview'));
    assert.ok(output.includes('## Core Web Vitals'));
    assert.ok(output.includes('## Main Thread Time Breakdown'));
  });

  test('runs several requested report sections with the same range and result shapes', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const args = ['node', 'trace-engine-cli'];
    const options = ['--time-range', '400,525'];
    const reportArgs = [...args, 'report', fixture, '--sections', 'tasks,network,tasks'];
    const output = decode(await captureCliOutput([...reportArgs, ...options]));
    assert.deepEqual(output, {
      tasks: decode(await captureCliOutput([...args, 'tasks', fixture, ...options])),
      network: decode(await captureCliOutput([...args, 'network', fixture, ...options])),
    });
    const jsonOptions = [...options, '--format', 'json'];
    const json = JSON.parse(await captureCliOutput([...reportArgs, ...jsonOptions]));
    assert.deepEqual(json, {
      tasks: JSON.parse(await captureCliOutput([...args, 'tasks', fixture, ...jsonOptions])),
      network: JSON.parse(await captureCliOutput([...args, 'network', fixture, ...jsonOptions])),
    });

    const markdown = await captureCliOutput([...args, 'report', fixture, '--format', 'md']);
    assert.match(markdown, /# Trace Overview.*# Tasks.*# Layout Shifts.*# Network Requests/s);
    const toon = await captureCliOutput([...args, 'report', fixture, '--sections', 'overview']);
    assert.match(toon, /^overview:/);
  });

  test('rejects unknown report sections before parsing the trace', async () => {
    const args = [
      'node',
      'trace-engine-cli',
      'report',
      'unavailable.json',
      '--sections',
      'tasks,unknown',
    ];
    await assert.rejects(() => captureCliOutput(args), /Unknown report section "unknown"/);
  });

  test('applies report task and network limits like the standalone commands', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const cli = ['node', 'trace-engine-cli'];
    const format = ['-f', 'json'];
    const json = JSON.parse(
      await captureCliOutput([
        ...cli,
        'report',
        fixture,
        '--sections',
        'tasks,network',
        '--tasks-tree',
        'bottom-up',
        '--tasks-top',
        '1',
        '--network-top',
        '1',
        ...format,
      ]),
    );
    const tasks = await captureCliOutput([
      ...cli,
      'tasks',
      fixture,
      '--tree',
      'bottom-up',
      '--top',
      '1',
      ...format,
    ]);
    const network = await captureCliOutput([
      ...cli,
      'network',
      fixture,
      '--slowest',
      '1',
      ...format,
    ]);
    assert.deepEqual(json, { tasks: JSON.parse(tasks), network: JSON.parse(network) });
    assert.equal(json.tasks.mode, 'bottom-up');
    assert.equal(json.tasks.tasks.length, 1);
    assert.equal(json.network.requests.length, 1);
  });

  test('returns every request when the report network limit exceeds the request count', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const json = JSON.parse(
      await captureCliOutput([
        'node',
        'trace-engine-cli',
        'report',
        fixture,
        '--sections',
        'network',
        '--network-top',
        '1000000',
        '-f',
        'json',
      ]),
    );
    assert.equal(json.network.requests.length, 4);
  });

  test('applies the selected renderer thread to the report tasks tree', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const cli = ['node', 'trace-engine-cli'];
    const options = ['--thread', '100:1', '-f', 'json'];
    const report = await captureCliOutput([
      ...cli,
      'report',
      fixture,
      '--sections',
      'tasks',
      '--tasks-tree',
      'bottom-up',
      ...options,
    ]);
    const tasks = await captureCliOutput([
      ...cli,
      'tasks',
      fixture,
      '--tree',
      'bottom-up',
      ...options,
    ]);
    assert.deepEqual(JSON.parse(report), { tasks: JSON.parse(tasks) });
  });

  test('rejects invalid report task and network options before parsing the trace', async () => {
    const cli = ['node', 'trace-engine-cli', 'report', 'unavailable.json'];
    await assert.rejects(
      () => captureCliOutput([...cli, '--tasks-top', '0']),
      /Result limits must be positive integers/,
    );
    await assert.rejects(
      () => captureCliOutput([...cli, '--network-top', '1.5']),
      /Result limits must be positive integers/,
    );
    await assert.rejects(
      () => captureCliOutput([...cli, '--tasks-tree', 'sideways']),
      /Invalid values:[\s\S]*tasks-tree[\s\S]*sideways/,
    );
  });

  test('honors relative time ranges for navigations and insight selection', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const args = ['node', 'trace-engine-cli'];
    const range = ['--time-range', '0,1'];
    assert.match(await captureCliOutput([...args, 'navigations', fixture, ...range]), /total: 0/);
    assert.match(
      await captureCliOutput([...args, 'insights', fixture, '--navigation', 'NAV_1', ...range]),
      /No insights found for navigation ID: NAV_1 in the selected time range/,
    );
  });

  test('runs tasks subcommand with relative time range', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
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
      'trace-engine-cli',
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

  test('lists renderer threads in Markdown and JSON', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const args = ['node', 'trace-engine-cli', 'threads', fixture];
    const threads = await captureCliOutput([...args, '--format', 'md']);
    assert.match(threads, /100:1.*CrRendererMain/);
    const json = JSON.parse(await captureCliOutput([...args, '--format', 'json']));
    assert.equal(json.threads[0].id, '100:1');
    assert.equal(json.threads[0].name, 'CrRendererMain');
  });

  test('finds named calls by URL on the chosen renderer thread', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const cli = ['node', 'trace-engine-cli'];
    const args = [...cli, 'find', fixture, '--thread', '100:1', '--url', 'app.js'];
    assert.match(await captureCliOutput(args), /bootApp/);
    assert.match(await captureCliOutput([...args, '--function', 'missing']), /totalCalls: 0/);
    await assert.rejects(
      () => captureCliOutput([...args.slice(0, 4), '--thread', '999:1', '--url', 'app.js']),
      /Unknown renderer thread.*threads <file>/,
    );
  });

  test('rejects non-positive result limits and bucket sizes', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const args = ['node', 'trace-engine-cli'];
    await assert.rejects(
      () => captureCliOutput([...args, 'tasks', fixture, '--top', '-5']),
      /positive integers/,
    );
    await assert.rejects(
      () => captureCliOutput([...args, 'profile', fixture, '--bucket', '0']),
      /--bucket must be at least/,
    );
  });

  test('requires a function or URL for find', async () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    await assert.rejects(
      () => captureCliOutput(['node', 'trace-engine-cli', 'find', fixture]),
      /Specify --function or --url/,
    );
  });

  test('runs profile subcommand with relative range and bucket units', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
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
      'trace-engine-cli',
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
      'trace-engine-cli',
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
    const output = await captureCliOutput(['node', 'trace-engine-cli', 'scheduling', fixturePath]);
    assert.ok(output.includes('animationFrames:'));
    assert.ok(output.includes('timers:'));
  });

  test('runs network subcommand', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput(['node', 'trace-engine-cli', 'network', fixturePath]);
    assert.ok(output.includes('requests[1]{'));
    assert.ok(output.includes('https://example.com/test'));
  });

  test('runs events subcommand with name and field filtering', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/shifts-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
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
    const navOutput = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'navigations',
      fixturePath,
    ]);
    assert.ok(navOutput.includes('NAV_1'));
    assert.ok(navOutput.includes('https://example.com/test'));

    const aliasOutput = await captureCliOutput(['node', 'trace-engine-cli', 'navs', fixturePath]);
    assert.ok(aliasOutput.includes('NAV_1'));
    assert.ok(aliasOutput.includes('https://example.com/test'));
  });

  test('runs shifts subcommand with --events flag', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/shifts-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'shifts',
      fixturePath,
      '--events',
    ]);
    assert.ok(output.includes('NAV_1'));
    assert.ok(output.includes('banner-ad'));
  });

  test('runs insights subcommand with --navigation flag', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
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
      'trace-engine-cli',
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
      'trace-engine-cli',
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
      await captureCliOutput(['node', 'trace-engine-cli', 'events', file1, file2]);
    }, /Command accepts only a single trace file\. Received multiple files\. To search across multiple files or directories, use:\n {2}trace-engine-cli scan <dir-or-glob>/);
  });

  test('rejects directory on single-file command with scan hint', async () => {
    const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
    await assert.rejects(async () => {
      await captureCliOutput(['node', 'trace-engine-cli', 'events', fixturesDir]);
    }, /is a directory\. Trace engine commands accept a single trace file\. To search across multiple files or directories, use: trace-engine-cli scan/);
  });

  test('runs with custom trace-engine path', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    const customEnginePath = path.resolve(
      import.meta.dirname,
      '../node_modules/@paulirish/trace_engine/models/trace/trace.js',
    );
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      fixturePath,
      '--trace-engine',
      customEnginePath,
    ]);
    assert.ok(output.includes('bounds:'));
    assert.ok(output.includes('https://example.com/test'));
  });

  test('runs interactions subcommand', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/interaction-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'interactions',
      fixturePath,
    ]);
    assert.ok(output.includes('click'));
    assert.ok(output.includes('BUTTON'));
  });

  test('runs insights subcommand with --category lcp', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'insights',
      fixturePath,
      '--category',
      'lcp',
    ]);
    assert.ok(output.includes('https://example.com/hero.jpg'));
    assert.ok(output.includes('totalLcpMs: 4150'));
  });

  test('runs network subcommand with --render-blocking', async () => {
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/navigation-cwv-trace.json');
    const output = await captureCliOutput([
      'node',
      'trace-engine-cli',
      'network',
      fixturePath,
      '--render-blocking',
    ]);
    assert.ok(output.includes('https://example.com/styles.css'));
  });

  test('offers a recapture hint when a trace parses without main frame metadata', async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trace-cli-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'no-frames.json');
    const tracingStarted = {
      name: 'TracingStartedInBrowser',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      pid: 1,
      tid: 1,
      ts: 1000,
      args: { data: { frames: [] } },
    };
    await writeFile(file, JSON.stringify([tracingStarted]));

    const args = ['node', 'trace-engine-cli', 'overview'];
    const validFixture = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
    await captureCliOutput([...args, validFixture]);

    const output = await captureCliOutput([...args, file]);
    assert.match(output, /^mainUrl: null$/m);
    assert.match(
      output,
      /No main page frame found.*DevTools Performance panel.*page target session/,
    );
  });
});

describe('CLI option validation', () => {
  const tracePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json');
  const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
  const cli = ['node', 'trace-engine-cli'];

  test('rejects negative --min-duration on tasks', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'tasks', tracePath, '--min-duration', '-5']),
      /--min-duration must be a number >= 0\./,
    );
  });

  test('rejects non-numeric --min-duration on tasks', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'tasks', tracePath, '--min-duration', 'abc']),
      /--min-duration must be a number >= 0\./,
    );
  });

  test('accepts --min-duration 0 on tasks', async () => {
    const output = await captureCliOutput([...cli, 'tasks', tracePath, '--min-duration', '0']);
    assert.match(output, /^mode: list$/m);
  });

  test('rejects --time-range on diff', async () => {
    await assert.rejects(
      captureCliOutput([
        ...cli,
        'diff',
        tracePath,
        '--window-a',
        '0,50',
        '--window-b',
        '50,100',
        '--time-range',
        '0,10',
      ]),
      /Unknown arguments: time-range/,
    );
  });

  test('rejects --time-range on threads', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'threads', tracePath, '--time-range', '0,10']),
      /Unknown arguments: time-range/,
    );
  });

  test('rejects --absolute-timestamps on threads', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'threads', tracePath, '--absolute-timestamps']),
      /Unknown arguments: absolute-timestamps/,
    );
  });

  test('rejects --time-range on scan', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'scan', fixturesDir, '--name', 'RunTask', '--time-range', '0,10']),
      /Unknown arguments: time-range/,
    );
  });

  test('rejects --absolute-timestamps on scan', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'scan', fixturesDir, '--name', 'RunTask', '--absolute-timestamps']),
      /Unknown arguments: absolute-timestamps/,
    );
  });

  test('rejects --bucket that creates more than 1000 buckets on profile', async () => {
    await assert.rejects(
      captureCliOutput([...cli, 'profile', tracePath, '--bucket', '10us']),
      /Bucket size 0\.01ms creates 16000 buckets over 160ms\. The maximum is 1000\./,
    );
  });
});

describe('CLI stdin input', () => {
  test('reads a piped trace when the file argument is -', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..');
    const fixturePath = path.resolve(import.meta.dirname, 'fixtures/basic-trace.json.gz');
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', 'bin/trace-engine-cli.ts', 'overview', '-', '--format', 'json'],
      { cwd: repoRoot, input: readFileSync(fixturePath), encoding: 'utf-8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).mainUrl, 'https://example.com/test');
  });
});
