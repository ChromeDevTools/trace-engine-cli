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
import { microToMilli } from '../../utils/units.js';
import { getPropertyByPath } from '../helpers.js';
import { decompressTraceBuffer, parseTraceJson } from '../loader.js';
import type { RawTraceEvent, ScanMatchedFile, ScanResult } from '../types.js';

/**
 * Options for scanning multiple trace files or directories.
 */
export interface ScanOptions {
  /** Target directories, glob patterns, or file paths (.json, .json.gz). */
  targets: string[];
  /** Exact event name or list of event names to match. */
  names?: string[];
  /** Exact event category to match. */
  category?: string;
  /** Exact event phase to match (e.g. 'X', 'I', 'B', 'E'). */
  phase?: string;
  /** Substring to match across event names, categories, or payload arguments. */
  grep?: string;
  /** Dot-notation property paths that must exist on matching events. */
  fields?: string[];
  /** Maximum number of matching files to return in the result. Default: 50. */
  limit?: number;
}

/**
 * Resolves a list of directory paths, glob patterns, or file paths into a deduplicated list of trace files.
 *
 * @throws {Error} When a literal target path does not exist.
 * @throws {Error} When no trace files (.json, .json.gz) are matched across all targets.
 */
export function resolveScanTargets(targets: string[]): string[] {
  const resolvedFiles = new Set<string>();

  for (const target of targets) {
    const hasGlobWildcards = /[*?[\]]/.test(target);

    if (hasGlobWildcards) {
      const globbed = fs.globSync(target);
      for (const file of globbed) {
        if (file.endsWith('.json') || file.endsWith('.json.gz')) {
          resolvedFiles.add(path.resolve(file));
        }
      }
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Target path not found: ${target}`);
      }
      throw err;
    }

    if (stat.isDirectory()) {
      const dirents = fs.readdirSync(target, { recursive: true, withFileTypes: true });
      for (const dirent of dirents) {
        if (dirent.isFile()) {
          const name = dirent.name;
          if (name.endsWith('.json') || name.endsWith('.json.gz')) {
            const dir = dirent.parentPath ?? (dirent as { path?: string }).path ?? target;
            resolvedFiles.add(path.resolve(dir, name));
          }
        }
      }
    } else if (stat.isFile()) {
      if (target.endsWith('.json') || target.endsWith('.json.gz')) {
        resolvedFiles.add(path.resolve(target));
      }
    }
  }

  const sorted = Array.from(resolvedFiles).sort();
  if (sorted.length === 0) {
    throw new Error(
      `No trace files (.json, .json.gz) found matching targets: ${targets.join(', ')}`,
    );
  }
  return sorted;
}

/**
 * Scans multiple trace files or directories for events matching query criteria.
 *
 * Uses fast string pre-filtering before JSON parsing to achieve high scanning throughput
 * across hundreds of fixtures without running heavyweight DevTools Trace Engine pipelines.
 *
 * @throws {Error} When no search filter options are provided.
 * @throws {Error} When resolveScanTargets fails to match trace files.
 */
export function scanTraces(options: ScanOptions): ScanResult {
  const { targets, names, category, phase, grep, fields, limit = 50 } = options;

  if (!names?.length && !category && !phase && !grep && !fields?.length) {
    throw new Error(
      'At least one search filter must be specified (--name, --category, --phase, --grep, or --fields).',
    );
  }

  const files = resolveScanTargets(targets);
  const namesSet = names && names.length > 0 ? new Set(names) : null;
  // Extract final property identifier from dot-notation path (e.g. 'args.data.id' -> 'id') for substring pre-filtering.
  const leafFields =
    fields && fields.length > 0 ? fields.map((f) => f.split('.').pop() ?? f) : null;

  const matchedFiles: ScanMatchedFile[] = [];
  let totalEventsMatched = 0;

  for (const filePath of files) {
    let rawBuffer: Buffer;
    try {
      rawBuffer = fs.readFileSync(filePath);
    } catch {
      continue;
    }

    let jsonContent: string;
    try {
      jsonContent = decompressTraceBuffer(rawBuffer, filePath);
    } catch {
      continue;
    }

    // Fast substring pre-filtering to eliminate non-matching files without JSON.parse overhead.
    if (grep && !jsonContent.includes(grep)) {
      continue;
    }

    if (names && names.length > 0) {
      const hasAnyName = names.some((n) => jsonContent.includes(n));
      if (!hasAnyName) {
        continue;
      }
    }

    if (category && !jsonContent.includes(category)) {
      continue;
    }

    if (leafFields && leafFields.length > 0) {
      const hasAllLeaves = leafFields.every((lf) => jsonContent.includes(lf));
      if (!hasAllLeaves) {
        continue;
      }
    }

    let rawEvents: unknown[];
    try {
      rawEvents = parseTraceJson(jsonContent);
    } catch {
      continue;
    }

    let fileMatches = 0;
    const fileCategories = new Set<string>();
    let firstEventName: string | undefined;
    let firstEventTsMs: number | undefined;

    for (const raw of rawEvents) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const event = raw as RawTraceEvent;

      const eventName = event.name ?? '';
      if (namesSet && !namesSet.has(eventName)) {
        continue;
      }

      const eventCat = event.cat;
      if (category) {
        const matchesCategory = Boolean(
          eventCat && (eventCat === category || eventCat.split(',').includes(category)),
        );
        if (!matchesCategory) {
          continue;
        }
      }

      const eventPh = event.ph;
      if (phase && eventPh !== phase) {
        continue;
      }

      if (grep) {
        const matchesGrep =
          eventName.includes(grep) ||
          Boolean(eventCat?.includes(grep)) ||
          Boolean(event.args && JSON.stringify(event.args).includes(grep));
        if (!matchesGrep) {
          continue;
        }
      }

      if (fields && fields.length > 0) {
        let hasAllFields = true;
        for (const field of fields) {
          if (getPropertyByPath(event, field) === undefined) {
            hasAllFields = false;
            break;
          }
        }
        if (!hasAllFields) {
          continue;
        }
      }

      fileMatches++;
      if (eventCat) {
        fileCategories.add(eventCat);
      }
      if (firstEventName === undefined) {
        firstEventName = eventName || '(anonymous)';
        firstEventTsMs = microToMilli(event.ts ?? 0);
      }
    }

    if (fileMatches > 0) {
      totalEventsMatched += fileMatches;
      const relativePath = path.relative(process.cwd(), filePath);
      matchedFiles.push({
        file: relativePath,
        matchCount: fileMatches,
        categories: Array.from(fileCategories).sort(),
        firstEventName,
        firstEventTsMs,
      });
    }
  }

  // Sort files by match count descending, with secondary alphabetical sort.
  matchedFiles.sort((a, b) => {
    if (b.matchCount !== a.matchCount) {
      return b.matchCount - a.matchCount;
    }
    return a.file.localeCompare(b.file);
  });

  return {
    query: {
      names,
      category,
      phase,
      grep,
      fields,
    },
    totalFilesScanned: files.length,
    totalFilesMatched: matchedFiles.length,
    totalEventsMatched,
    matchedFiles: matchedFiles.slice(0, limit),
  };
}
