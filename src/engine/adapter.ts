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
import { pathToFileURL } from 'node:url';

export type TraceEngine = typeof import('@paulirish/trace_engine');

let cachedEngine: TraceEngine | null = null;
let cachedCustomPath: string | undefined;

/**
 * Dynamically resolves and imports the DevTools Trace Engine module.
 *
 * Resolution priority:
 * 1. Explicit path passed via `customPath` (e.g. `--trace-engine=<path>`)
 * 2. Locally vendored engine bundle at `./vendor/trace_engine.js` (generated via `npm run bundle:engine`)
 * 3. Default npm package distribution `@paulirish/trace_engine`
 *
 * @param customPath - Optional filesystem path to a custom Trace Engine bundle.
 * @returns The imported TraceEngine module namespace.
 */
export async function loadTraceEngine(customPath?: string): Promise<TraceEngine> {
  if (cachedEngine && cachedCustomPath === customPath) {
    return cachedEngine;
  }

  let engine: TraceEngine;

  if (customPath) {
    const resolved = path.resolve(process.cwd(), customPath);
    engine = (await import(pathToFileURL(resolved).href)) as TraceEngine;
  } else {
    const vendoredPath = path.resolve(import.meta.dirname, 'vendor/trace_engine.js');
    if (fs.existsSync(vendoredPath)) {
      engine = (await import(pathToFileURL(vendoredPath).href)) as TraceEngine;
    } else {
      engine = (await import('@paulirish/trace_engine')) as TraceEngine;
    }
  }

  cachedEngine = engine;
  cachedCustomPath = customPath;
  return engine;
}
