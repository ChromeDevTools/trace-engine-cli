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

import type { TimeRange } from '../../utils/filter.js';
import type { LoadedTrace } from '../loader.js';
import { extractInsights } from './insights.js';
import { extractInteractions } from './interactions.js';
import { extractNavigations } from './navigations.js';
import { extractNetwork } from './network.js';
import { extractOverview } from './overview.js';
import { extractProfile } from './profile.js';
import { extractScheduling } from './scheduling.js';
import { extractShifts } from './shifts.js';
import { extractTasks } from './tasks.js';

export const REPORT_SECTIONS = [
  'overview',
  'insights',
  'tasks',
  'profile',
  'scheduling',
  'network',
  'interactions',
  'shifts',
  'navigations',
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const DEFAULT_REPORT_SECTIONS: ReportSection[] = ['overview', 'tasks', 'shifts', 'network'];

interface ExtractReportOptions {
  sections: readonly ReportSection[];
  timeRange?: TimeRange;
  threadId?: string;
  stripQuery?: boolean;
}

export function extractReport(
  loaded: LoadedTrace,
  options: ExtractReportOptions,
): Array<[ReportSection, unknown]> {
  const { timeRange, threadId, stripQuery } = options;
  const extract: Record<ReportSection, () => unknown> = {
    overview: () => extractOverview(loaded, { timeRange, threadId }),
    insights: () => extractInsights(loaded, { timeRange }),
    tasks: () => extractTasks(loaded, { timeRange, threadId }),
    profile: () => extractProfile(loaded, { timeRange, threadId }),
    scheduling: () => extractScheduling(loaded, { timeRange }),
    network: () => extractNetwork(loaded, { timeRange, stripQuery }),
    interactions: () => extractInteractions(loaded, { timeRange }),
    shifts: () => extractShifts(loaded, { timeRange }),
    navigations: () => extractNavigations(loaded, timeRange),
  };

  return options.sections.map((section) => [section, extract[section]()]);
}
