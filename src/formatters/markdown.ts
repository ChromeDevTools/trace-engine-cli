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

import type {
  DiffResult,
  EventsResult,
  FindResult,
  InsightsResult,
  InteractionsResult,
  NavigationsResult,
  NetworkResult,
  OverviewResult,
  ProfileResult,
  ScanResult,
  SchedulingResult,
  ShiftsResult,
  TasksResult,
} from '../engine/types.js';
import { formatBytes, formatMs, formatScore } from '../utils/units.js';

export function formatOverviewMarkdown(overview: OverviewResult): string {
  const lines: string[] = [];
  lines.push('# Trace Overview');
  lines.push('');
  lines.push(`- **Main URL**: \`${overview.mainUrl || 'N/A'}\``);
  lines.push(
    `- **Duration**: \`${formatMs(overview.bounds.durationMs)}\` (Range: \`${formatMs(overview.bounds.minMs)}\` - \`${formatMs(overview.bounds.maxMs)}\`)`,
  );
  if (overview.navigationStartMs !== null) {
    lines.push(`- **Navigation Start**: \`${formatMs(overview.navigationStartMs)}\``);
  }
  lines.push('');

  lines.push('## Core Web Vitals');
  lines.push('');
  lines.push('| Metric | Value | Rating | Details |');
  lines.push('|---|---|---|---|');

  const { fcp, lcp, cls, inp } = overview.coreWebVitals;
  lines.push(`| FCP | ${fcp ? formatMs(fcp.valueMs) : 'N/A'} | ${fcp ? fcp.rating : 'N/A'} | - |`);
  lines.push(
    `| LCP | ${lcp ? formatMs(lcp.valueMs) : 'N/A'} | ${lcp ? lcp.rating : 'N/A'} | ${lcp?.element || lcp?.url || '-'} |`,
  );
  lines.push(
    `| CLS | ${cls ? formatScore(cls.value) : 'N/A'} | ${cls ? cls.rating : 'N/A'} | ${cls?.worstClusterScore ? `Worst cluster: ${formatScore(cls.worstClusterScore)}` : '-'} |`,
  );
  lines.push(
    `| INP | ${inp ? formatMs(inp.valueMs) : 'N/A'} | ${inp ? inp.rating : 'N/A'} | ${inp?.interactionType || '-'} |`,
  );
  lines.push('');

  lines.push('## Main Thread Time Breakdown');
  lines.push('');
  lines.push('| Category | Duration (ms) | Share |');
  lines.push('|---|---|---|');
  const b = overview.mainThreadBreakdown;
  const total = b.totalMs > 0 ? b.totalMs : 1;
  const rows = [
    { name: 'Scripting', ms: b.scriptingMs },
    { name: 'Layout', ms: b.layoutMs },
    { name: 'Rendering', ms: b.renderingMs },
    { name: 'Garbage Collection', ms: b.gcMs },
    { name: 'System', ms: b.systemMs },
    { name: 'Idle', ms: b.idleMs },
  ];

  for (const row of rows) {
    const pct = ((row.ms / total) * 100).toFixed(1);
    lines.push(`| ${row.name} | ${formatMs(row.ms)} | ${pct}% |`);
  }
  lines.push(`| **Total** | **${formatMs(b.totalMs)}** | **100%** |`);
  lines.push('');

  if (overview.warnings.length > 0) {
    lines.push('## Warnings & Diagnostics');
    lines.push('');
    for (const w of overview.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatInsightsMarkdown(insights: InsightsResult): string {
  const lines: string[] = ['# Diagnostic Insights', ''];

  if (insights.navigationId) {
    lines.push(`- **Navigation ID**: \`${insights.navigationId}\``, '');
  }

  if (insights.lcpBreakdown) {
    const l = insights.lcpBreakdown;
    lines.push('## LCP Breakdown');
    lines.push('');
    lines.push(`- **Total LCP**: \`${formatMs(l.totalLcpMs)}\``);
    lines.push(`- **TTFB**: \`${formatMs(l.ttfbMs)}\``);
    lines.push(`- **Resource Load Delay**: \`${formatMs(l.loadDelayMs)}\``);
    lines.push(`- **Resource Load Duration**: \`${formatMs(l.loadDurationMs)}\``);
    lines.push(`- **Element Render Delay**: \`${formatMs(l.renderDelayMs)}\``);
    if (l.lcpElement) lines.push(`- **Element**: \`${l.lcpElement}\``);
    if (l.lcpUrl) lines.push(`- **Resource URL**: \`${l.lcpUrl}\``);
    lines.push('');
  }

  if (insights.inpBreakdown) {
    const i = insights.inpBreakdown;
    lines.push('## INP Breakdown');
    lines.push('');
    lines.push(`- **Event Type**: \`${i.eventType}\``);
    lines.push(`- **Total Duration**: \`${formatMs(i.totalDurationMs)}\``);
    lines.push(`- **Input Delay**: \`${formatMs(i.inputDelayMs)}\``);
    lines.push(`- **Processing Duration**: \`${formatMs(i.processingDurationMs)}\``);
    lines.push(`- **Presentation Delay**: \`${formatMs(i.presentationDelayMs)}\``);
    if (i.target) lines.push(`- **Target**: \`${i.target}\``);
    lines.push('');
  }

  if (insights.clsCulprits && insights.clsCulprits.length > 0) {
    lines.push('## CLS Culprits');
    lines.push('');
    lines.push('| Timestamp (ms) | Score | Culprit Elements |');
    lines.push('|---|---|---|');
    for (const c of insights.clsCulprits) {
      lines.push(
        `| ${formatMs(c.timestampMs)} | ${formatScore(c.score)} | ${c.culpritNodes.join(', ') || 'N/A'} |`,
      );
    }
    lines.push('');
  }

  if (insights.renderBlocking && insights.renderBlocking.length > 0) {
    lines.push('## Render Blocking Resources');
    lines.push('');
    lines.push('| URL | Duration (ms) | Transfer Size |');
    lines.push('|---|---|---|');
    for (const r of insights.renderBlocking) {
      lines.push(
        `| \`${r.url}\` | ${formatMs(r.durationMs)} | ${formatBytes(r.transferSizeBytes)} |`,
      );
    }
    lines.push('');
  }

  if (insights.thirdParties && insights.thirdParties.length > 0) {
    lines.push('## Third-Party Entities');
    lines.push('');
    lines.push('| Entity | Main Thread CPU (ms) | Transfer Size |');
    lines.push('|---|---|---|');
    for (const tp of insights.thirdParties) {
      lines.push(
        `| ${tp.entityName} | ${formatMs(tp.mainThreadTimeMs)} | ${formatBytes(tp.transferSizeBytes)} |`,
      );
    }
    lines.push('');
  }

  if (insights.warnings && insights.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of insights.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatTasksMarkdown(tasksResult: TasksResult): string {
  const lines: string[] = [`# Tasks (${tasksResult.mode})`, ''];
  if (tasksResult.tasks.length === 0) {
    lines.push('No tasks found matching criteria.');
    return lines.join('\n');
  }

  lines.push('| Start (ms) | Duration (ms) | Self Time (ms) | Function / Task | Location |');
  lines.push('|---|---|---|---|---|');
  for (const t of tasksResult.tasks) {
    const loc = t.url ? `${t.url}${t.lineNumber !== undefined ? `:${t.lineNumber}` : ''}` : '-';
    lines.push(
      `| ${formatMs(t.startTimeMs)} | ${formatMs(t.durationMs)} | ${formatMs(t.selfTimeMs)} | \`${t.functionName}\` | \`${loc}\` |`,
    );
  }
  return lines.join('\n');
}

export function formatNetworkMarkdown(network: NetworkResult): string {
  const lines: string[] = ['# Network Requests', ''];

  if (network.initiatorChain && network.initiatorChain.length > 0) {
    lines.push('## Initiator Chain');
    lines.push('');
    for (let idx = 0; idx < network.initiatorChain.length; idx++) {
      const item = network.initiatorChain[idx];
      const indent = '  '.repeat(idx);
      lines.push(`${indent}- \`${item.url}\` (${item.type || 'request'})`);
    }
    lines.push('');
  }

  if (network.requests.length === 0) {
    lines.push('No network requests found matching criteria.');
    return lines.join('\n');
  }

  lines.push('| URL | MIME | Priority | Queue | TTFB | Download | Total | Size | Blocking |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of network.requests) {
    lines.push(
      `| \`${r.url}\` | ${r.mimeType || '-'} | ${r.priority} | ${formatMs(r.timing.queueingMs)} | ${formatMs(r.timing.ttfbMs)} | ${formatMs(r.timing.downloadMs)} | ${formatMs(r.timing.totalDurationMs)} | ${formatBytes(r.transferSizeBytes)} | ${r.renderBlocking ? 'Yes' : 'No'} |`,
    );
  }
  return lines.join('\n');
}

export function formatInteractionsMarkdown(interactions: InteractionsResult): string {
  const lines: string[] = ['# User Interactions', ''];
  if (interactions.interactions.length === 0) {
    lines.push('No user interactions found in trace.');
    return lines.join('\n');
  }

  lines.push(
    '| Event Type | Start (ms) | Total (ms) | Input Delay | Processing | Presentation Delay | Target |',
  );
  lines.push('|---|---|---|---|---|---|---|');
  for (const i of interactions.interactions) {
    lines.push(
      `| \`${i.eventType}\` | ${formatMs(i.startTimeMs)} | ${formatMs(i.durationMs)} | ${formatMs(i.inputDelayMs)} | ${formatMs(i.processingDurationMs)} | ${formatMs(i.presentationDelayMs)} | \`${i.targetElement || '-'}\` |`,
    );
  }
  return lines.join('\n');
}

function formatCulpritLabel(item: {
  debugName?: string;
  selector?: string;
  tagName?: string;
  nodeId?: number;
}): string {
  const detail =
    item.selector ||
    item.tagName ||
    (item.nodeId !== undefined ? `Node #${item.nodeId}` : undefined);
  if (item.debugName && detail) return `${item.debugName} (${detail})`;
  return item.debugName || detail || 'unknown';
}

export function formatShiftsMarkdown(shifts: ShiftsResult): string {
  const lines: string[] = ['# Layout Shifts', ''];
  if (shifts.clusters.length === 0) {
    lines.push('No layout shifts or clusters detected in trace.');
    return lines.join('\n');
  }

  const hasNavIds = shifts.clusters.some((c) => c.navigationId);

  if (hasNavIds) {
    lines.push('| Start (ms) | Duration (ms) | Score | Navigation ID | Culprit Elements |');
    lines.push('|---|---|---|---|---|');
    for (const c of shifts.clusters) {
      const culprits = c.culprits.map(formatCulpritLabel).join(', ');
      lines.push(
        `| ${formatMs(c.timestampMs)} | ${formatMs(c.durationMs)} | ${formatScore(c.cumulativeScore)} | \`${c.navigationId || '-'}\` | ${culprits || '-'} |`,
      );
    }
  } else {
    lines.push('| Start (ms) | Duration (ms) | Score | Culprit Elements |');
    lines.push('|---|---|---|---|');
    for (const c of shifts.clusters) {
      const culprits = c.culprits.map(formatCulpritLabel).join(', ');
      lines.push(
        `| ${formatMs(c.timestampMs)} | ${formatMs(c.durationMs)} | ${formatScore(c.cumulativeScore)} | ${culprits || '-'} |`,
      );
    }
  }

  const hasIndividualEvents = shifts.clusters.some((c) => c.events && c.events.length > 0);
  if (hasIndividualEvents) {
    lines.push('');
    lines.push('## Individual Shift Events');
    lines.push('');
    lines.push('| Timestamp (ms) | Score | Navigation ID | Recent Input | Impacted Elements |');
    lines.push('|---|---|---|---|---|');
    for (const c of shifts.clusters) {
      if (c.events) {
        for (const ev of c.events) {
          const nodes = (ev.impactedNodes || []).map(formatCulpritLabel).join(', ');
          lines.push(
            `| ${formatMs(ev.timestampMs)} | ${formatScore(ev.score)} | \`${ev.navigationId || '-'}\` | ${ev.hadRecentInput ? 'Yes' : 'No'} | ${nodes || '-'} |`,
          );
        }
      }
    }
  }

  return lines.join('\n');
}

export function formatFindMarkdown(findResult: FindResult): string {
  const lines: string[] = [`# Function Execution: \`${findResult.functionQuery}\``, ''];
  lines.push(`- **Total Calls**: \`${findResult.totalCalls}\``);
  lines.push(`- **Total Duration**: \`${formatMs(findResult.totalDurationMs)}\``);
  lines.push(`- **Average Duration**: \`${formatMs(findResult.avgDurationMs)}\``);
  if (findResult.firstCallMs !== undefined) {
    lines.push(`- **First Call**: \`${formatMs(findResult.firstCallMs)}\``);
  }
  if (findResult.lastCallMs !== undefined) {
    lines.push(`- **Last Call**: \`${formatMs(findResult.lastCallMs)}\``);
  }
  lines.push('');

  if (findResult.intervals && findResult.intervals.length > 0) {
    lines.push('## Call Frequency by Time Interval');
    lines.push('');
    lines.push('| Interval (ms) | Calls | Duration (ms) |');
    lines.push('|---|---|---|');
    for (const inv of findResult.intervals) {
      lines.push(
        `| ${formatMs(inv.startMs)} - ${formatMs(inv.endMs)} | ${inv.calls} | ${formatMs(inv.totalDurationMs)} |`,
      );
    }
    lines.push('');
  }

  if (findResult.calls.length > 0) {
    lines.push('## Call Invocations');
    lines.push('');
    lines.push('| Timestamp (ms) | Duration (ms) | Location |');
    lines.push('|---|---|---|');
    for (const c of findResult.calls) {
      const loc = c.url ? `${c.url}${c.lineNumber !== undefined ? `:${c.lineNumber}` : ''}` : '-';
      lines.push(`| ${formatMs(c.timestampMs)} | ${formatMs(c.durationMs)} | \`${loc}\` |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatProfileMarkdown(profileResult: ProfileResult): string {
  const lines: string[] = [
    `# CPU Profile Progression (${formatMs(profileResult.bucketSizeMs)} buckets)`,
    '',
  ];

  if (profileResult.buckets.length === 0) {
    lines.push('No CPU activity found in the specified range.');
    return lines.join('\n');
  }

  lines.push('| Time Bucket | Active CPU (ms) | Top Functions (% of slice) |');
  lines.push('|---|---|---|');
  for (const b of profileResult.buckets) {
    const topSummary = b.topFunctions.map((f) => `${f.name} (${f.selfTimePct}%)`).join(', ');
    lines.push(
      `| ${formatMs(b.startMs)} - ${formatMs(b.endMs)} | ${formatMs(b.totalActiveMs)} | ${topSummary || 'None (Idle)'} |`,
    );
  }
  return lines.join('\n');
}

export function formatDiffMarkdown(diffResult: DiffResult): string {
  const lines: string[] = ['# Differential Profile', ''];
  lines.push(
    `- **Window A**: \`${formatMs(diffResult.windowA.startMs)} - ${formatMs(diffResult.windowA.endMs)}\` (${formatMs(diffResult.windowA.durationMs)})`,
  );
  lines.push(
    `- **Window B**: \`${formatMs(diffResult.windowB.startMs)} - ${formatMs(diffResult.windowB.endMs)}\` (${formatMs(diffResult.windowB.durationMs)})`,
  );
  lines.push('');

  if (diffResult.entries.length === 0) {
    lines.push('No significant differences detected between the two windows.');
    return lines.join('\n');
  }

  lines.push('| Function | Window A (%) | Window B (%) | Shift (\u0394) | Location |');
  lines.push('|---|---|---|---|---|');
  for (const d of diffResult.entries) {
    const sign = d.deltaPct > 0 ? '+' : '';
    lines.push(
      `| \`${d.functionName}\` | ${d.selfTimePctA}% (${formatMs(d.selfTimeMsA)}) | ${d.selfTimePctB}% (${formatMs(d.selfTimeMsB)}) | **${sign}${d.deltaPct}%** | \`${d.url || '-'}\` |`,
    );
  }
  return lines.join('\n');
}

export function formatSchedulingMarkdown(sched: SchedulingResult): string {
  const lines: string[] = ['# Async Task & Animation Scheduling', ''];

  lines.push('## Animation Frames (`requestAnimationFrame`)');
  lines.push('');
  lines.push(`- **Scheduled**: \`${sched.animationFrames.scheduledCount}\``);
  lines.push(`- **Canceled**: \`${sched.animationFrames.canceledCount}\``);
  lines.push(`- **Executed**: \`${sched.animationFrames.executedCount}\``);
  lines.push(`- **Cancellation Rate**: \`${sched.animationFrames.cancellationRatePct}%\``);
  lines.push('');

  lines.push('## Timers (`setTimeout` / `setInterval`)');
  lines.push('');
  lines.push(`- **Installed**: \`${sched.timers.scheduledCount}\``);
  lines.push(`- **Removed**: \`${sched.timers.canceledCount}\``);
  lines.push(`- **Fired**: \`${sched.timers.executedCount}\``);
  lines.push(`- **Cancellation Rate**: \`${sched.timers.cancellationRatePct}%\``);
  lines.push('');

  if (sched.warnings.length > 0) {
    lines.push('## Scheduling Churn Warnings');
    lines.push('');
    for (const w of sched.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatEventsMarkdown(result: EventsResult): string {
  const lines: string[] = ['# Raw Trace Events', ''];
  lines.push(`- **Matched**: \`${result.totalMatched}\``);
  lines.push(`- **Returned**: \`${result.returned}\``);
  lines.push('');

  if (result.events.length === 0) {
    lines.push('No matching trace events found.');
    return lines.join('\n');
  }

  const hasSelectedFields = result.events.some((e) => e.selectedFields);
  if (hasSelectedFields) {
    const fieldSet = new Set<string>();
    for (const ev of result.events) {
      if (ev.selectedFields) {
        for (const k of Object.keys(ev.selectedFields)) {
          fieldSet.add(k);
        }
      }
    }
    const fieldList = Array.from(fieldSet);
    lines.push(`| Name | Timestamp (ms) | ${fieldList.join(' | ')} |`);
    lines.push(`|---|---|${fieldList.map(() => '---|').join('')}`);
    for (const ev of result.events) {
      const fieldVals = fieldList.map((f) => {
        const val = ev.selectedFields?.[f];
        if (val === undefined) return '-';
        const raw = typeof val === 'object' ? JSON.stringify(val) : String(val);
        const sanitized = raw.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        return `\`${sanitized}\``;
      });
      lines.push(`| \`${ev.name}\` | ${formatMs(ev.tsMs)} | ${fieldVals.join(' | ')} |`);
    }
  } else {
    lines.push('| Name | Timestamp (ms) | Duration (ms) | Category | Phase | PID | TID |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const ev of result.events) {
      const dur = ev.durMs !== undefined ? formatMs(ev.durMs) : '-';
      lines.push(
        `| \`${ev.name}\` | ${formatMs(ev.tsMs)} | ${dur} | ${ev.cat || '-'} | ${ev.ph || '-'} | ${ev.pid ?? '-'} | ${ev.tid ?? '-'} |`,
      );
    }
  }
  return lines.join('\n');
}

export function formatNavigationsMarkdown(result: NavigationsResult): string {
  const lines: string[] = ['# Trace Navigations', ''];
  lines.push(`- **Total Navigations**: \`${result.total}\``);
  if (result.insightSetIds.length > 0) {
    lines.push(`- **Insight Set IDs**: \`${result.insightSetIds.join('`, `')}\``);
  }
  lines.push('');

  if (result.navigations.length === 0) {
    lines.push('No navigation events found in trace.');
    return lines.join('\n');
  }

  lines.push(
    '| Navigation ID | Insight Set ID | URL | Timestamp (ms) | Frame ID | Main Frame | Has Insights |',
  );
  lines.push('|---|---|---|---|---|---|---|');
  for (const nav of result.navigations) {
    lines.push(
      `| \`${nav.navigationId}\` | \`${nav.insightSetId || '-'}\` | \`${nav.url || '-'}\` | ${formatMs(nav.timestampMs)} | \`${nav.frameId || '-'}\` | ${nav.isMainFrame ? 'Yes' : 'No'} | ${nav.hasInsights ? 'Yes' : 'No'} |`,
    );
  }
  return lines.join('\n');
}

export function formatScanMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  lines.push('# Trace Scan Results');
  lines.push('');

  const queryItems: string[] = [];
  if (result.query.names && result.query.names.length > 0) {
    queryItems.push(`name: \`${result.query.names.join(', ')}\``);
  }
  if (result.query.category) {
    queryItems.push(`category: \`${result.query.category}\``);
  }
  if (result.query.phase) {
    queryItems.push(`phase: \`${result.query.phase}\``);
  }
  if (result.query.grep) {
    queryItems.push(`grep: "${result.query.grep}"`);
  }
  if (result.query.fields && result.query.fields.length > 0) {
    queryItems.push(`fields: \`${result.query.fields.join(', ')}\``);
  }

  if (queryItems.length > 0) {
    lines.push(`- **Query**: ${queryItems.join(', ')}`);
  }
  lines.push(`- **Files Scanned**: ${result.totalFilesScanned}`);
  if (result.totalFilesMatched > result.matchedFiles.length) {
    lines.push(
      `- **Files Matched**: ${result.totalFilesMatched} (showing top ${result.matchedFiles.length})`,
    );
  } else {
    lines.push(`- **Files Matched**: ${result.totalFilesMatched}`);
  }
  lines.push(`- **Total Events Matched**: ${result.totalEventsMatched}`);
  lines.push('');

  if (result.matchedFiles.length === 0) {
    lines.push('No matching trace files found.');
    return lines.join('\n');
  }

  lines.push('| File | Matches | Categories | First Event | First Event Timestamp |');
  lines.push('|---|---|---|---|---|');
  for (const item of result.matchedFiles) {
    const safeFile = item.file.replace(/\|/g, '\\|');
    const cats =
      item.categories.length > 0 ? item.categories.join(', ').replace(/\|/g, '\\|') : '-';
    const firstEvent = item.firstEventName
      ? `\`${item.firstEventName.replace(/\|/g, '\\|')}\``
      : '-';
    const firstTs = item.firstEventTsMs !== undefined ? formatMs(item.firstEventTsMs) : '-';
    lines.push(`| \`${safeFile}\` | ${item.matchCount} | ${cats} | ${firstEvent} | ${firstTs} |`);
  }

  return lines.join('\n');
}

export function formatMarkdown(data: unknown, type?: string): string {
  switch (type) {
    case 'overview':
      return formatOverviewMarkdown(data as OverviewResult);
    case 'insights':
      return formatInsightsMarkdown(data as InsightsResult);
    case 'tasks':
      return formatTasksMarkdown(data as TasksResult);
    case 'network':
      return formatNetworkMarkdown(data as NetworkResult);
    case 'interactions':
      return formatInteractionsMarkdown(data as InteractionsResult);
    case 'shifts':
      return formatShiftsMarkdown(data as ShiftsResult);
    case 'find':
      return formatFindMarkdown(data as FindResult);
    case 'profile':
      return formatProfileMarkdown(data as ProfileResult);
    case 'diff':
      return formatDiffMarkdown(data as DiffResult);
    case 'scheduling':
      return formatSchedulingMarkdown(data as SchedulingResult);
    case 'events':
      return formatEventsMarkdown(data as EventsResult);
    case 'navigations':
      return formatNavigationsMarkdown(data as NavigationsResult);
    case 'scan':
      return formatScanMarkdown(data as ScanResult);
    default:
      return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
}
