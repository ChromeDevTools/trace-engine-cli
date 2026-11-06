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

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadTraceEngine, type TraceEngine } from './adapter.js';

export interface LoadedTrace {
  engine: TraceEngine;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic trace engine compatibility
  parsedTrace: any;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic trace engine compatibility
  rawEvents: any[];
}

/**
 * Checks if the buffer starts with the gzip magic header bytes (0x1f, 0x8b).
 */
export function isGzipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/**
 * Decompresses a trace buffer if it is gzip-compressed or has a .gz extension.
 */
export function decompressTraceBuffer(buffer: Buffer, filePath?: string): string {
  const isGz = Boolean(filePath?.endsWith('.gz')) || isGzipBuffer(buffer);
  if (isGz) {
    return zlib.gunzipSync(buffer).toString('utf-8');
  }
  return buffer.toString('utf-8');
}

/**
 * Parses raw JSON string into an array of trace events.
 * Accepts both raw arrays `[...]` and wrapped objects `{"traceEvents": [...]}`.
 */
export function parseTraceJson(jsonString: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(
      `Failed to parse trace JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'traceEvents' in parsed &&
    Array.isArray((parsed as { traceEvents: unknown[] }).traceEvents)
  ) {
    return (parsed as { traceEvents: unknown[] }).traceEvents;
  }

  throw new Error(
    'Unrecognized trace format: JSON root must be an array of trace events or an object containing a "traceEvents" array.',
  );
}

function isLanternError(arg: unknown): boolean {
  if (!arg) return false;
  if (typeof arg === 'object' && arg !== null && ('name' in arg || 'constructor' in arg)) {
    const errorObj = arg as { name?: string; constructor?: { name?: string }; message?: string };
    if (errorObj.name === 'LanternError' || errorObj.constructor?.name === 'LanternError') {
      return true;
    }
    if (errorObj.message?.includes('NO_LCP')) {
      return true;
    }
  }
  if (typeof arg === 'string' && (arg.includes('LanternError') || arg.includes('NO_LCP'))) {
    return true;
  }
  return false;
}

/**
 * Loads, decompresses, and parses a Chromium performance trace file using DevTools Trace Engine.
 *
 * Capabilities:
 * - Transparently gunzips files with `.gz` extensions or gzip magic bytes (`0x1f 0x8b`).
 * - Supports raw event arrays (`[...]`) and standard Chrome wrapper objects (`{ traceEvents: [...] }`).
 * - Normalizes `parsedTrace` retrieval across different DevTools engine versions (`parsedTrace(0)` vs `traceParsedData(0)`).
 * - Filters internal non-fatal Lantern simulation errors during model parsing.
 *
 * @param filePath - Relative or absolute path to the trace file.
 * @param customEnginePath - Optional custom Trace Engine bundle path.
 * @returns Object containing the TraceEngine instance, parsedTrace data, and rawEvents.
 * @throws {Error} If the file does not exist, is invalid JSON, or lacks trace events.
 */
export async function loadTraceFromFile(
  filePath: string,
  customEnginePath?: string,
): Promise<LoadedTrace> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  let rawBuffer: Buffer;

  try {
    rawBuffer = fs.readFileSync(absolutePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Trace file not found: ${absolutePath}`);
    }
    if ((err as NodeJS.ErrnoException).code === 'EISDIR') {
      throw new Error(
        `'${filePath}' is a directory. Trace engine commands accept a single trace file. To search across multiple files or directories, use: trace-engine-cli scan "${filePath}" [options]`,
      );
    }
    throw err;
  }

  const jsonContent = decompressTraceBuffer(rawBuffer, absolutePath);
  const rawEvents = parseTraceJson(jsonContent);

  const engine = await loadTraceEngine(customEnginePath);
  const model = engine.TraceModel.Model.createWithAllHandlers();

  const origWarn = console.warn;
  const origError = console.error;

  try {
    console.warn = (...args: unknown[]) => {
      if (args.length > 0 && isLanternError(args[0])) return;
      origWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      if (args.length > 0 && isLanternError(args[0])) return;
      origError(...args);
    };

    // biome-ignore lint/suspicious/noExplicitAny: trace engine parse events typing
    await model.parse(rawEvents as any);
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }

  // Normalize parsedTrace across devtools engine versions
  const parsedTrace =
    typeof model.parsedTrace === 'function'
      ? model.parsedTrace(0)
      : typeof (model as unknown as { traceParsedData: (i: number) => unknown }).traceParsedData ===
          'function'
        ? (model as unknown as { traceParsedData: (i: number) => unknown }).traceParsedData(0)
        : null;

  if (!parsedTrace) {
    throw new Error('Failed to retrieve parsed trace data from TraceEngine model.');
  }

  return {
    engine,
    parsedTrace,
    rawEvents,
  };
}
