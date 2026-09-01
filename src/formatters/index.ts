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

import { formatMarkdown } from './markdown.js';
import { formatToon } from './toon.js';

export interface FormatOptions {
  format: 'toon' | 'md';
  type?:
    | 'overview'
    | 'insights'
    | 'tasks'
    | 'network'
    | 'interactions'
    | 'shifts'
    | 'find'
    | 'profile'
    | 'diff'
    | 'scheduling'
    | 'events'
    | 'navigations'
    | 'scan';
  includeHint?: boolean;
}

const NEXT_STEPS_HINT_TOON = `
# Drill-down commands:
# - trace-cli insights <file> [--category <lcp|inp|cls|render-blocking|third-parties>] [--navigation <id>]
# - trace-cli tasks <file> [--min-duration <ms>] [--tree <bottom-up|top-down>] [--top <n>]
# - trace-cli find <file> --function <name> [--time-range <start,end>]
# - trace-cli profile <file> [--time-range <start,end>] [--bucket <ms>]
# - trace-cli diff <file> --window-a <start,end> --window-b <start,end>
# - trace-cli scheduling <file> [--time-range <start,end>]
# - trace-cli network <file> [--render-blocking] [--slowest <n>] [--initiator-chain <url>]
# - trace-cli interactions <file>
# - trace-cli shifts <file> [--events]
# - trace-cli events <file> [--name <names>] [--cat <category>] [--fields <fields>]
# - trace-cli navigations <file>
#
# Multi-file search:
# - trace-cli scan <dir-or-glob> [--name <names>] [--cat <category>] [--grep <pattern>]
`.trim();

const NEXT_STEPS_HINT_MD = `
---
### Drill-down Commands
- \`trace-cli insights <file> [--category <lcp|inp|cls|render-blocking|third-parties>] [--navigation <id>]\`
- \`trace-cli tasks <file> [--min-duration <ms>] [--tree <bottom-up|top-down>] [--top <n>]\`
- \`trace-cli find <file> --function <name> [--time-range <start,end>]\`
- \`trace-cli profile <file> [--time-range <start,end>] [--bucket <ms>]\`
- \`trace-cli diff <file> --window-a <start,end> --window-b <start,end>\`
- \`trace-cli scheduling <file> [--time-range <start,end>]\`
- \`trace-cli network <file> [--render-blocking] [--slowest <n>] [--initiator-chain <url>]\`
- \`trace-cli interactions <file>\`
- \`trace-cli shifts <file> [--events]\`
- \`trace-cli events <file> [--name <names>] [--cat <category>] [--fields <fields>]\`
- \`trace-cli navigations <file>\`

### Multi-file Search
- \`trace-cli scan <dir-or-glob> [--name <names>] [--cat <category>] [--grep <pattern>]\`
`.trim();

export function formatResult(data: unknown, options: FormatOptions): string {
  let output = '';
  if (options.format === 'md') {
    output = formatMarkdown(data, options.type);
    if (options.includeHint) {
      output = `${output}\n\n${NEXT_STEPS_HINT_MD}`;
    }
  } else {
    output = formatToon(data);
    if (options.includeHint) {
      output = `${output}\n\n${NEXT_STEPS_HINT_TOON}`;
    }
  }
  return output;
}
