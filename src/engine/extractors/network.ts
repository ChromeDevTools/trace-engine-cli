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

import { isEventInBounds, type TimeRange } from '../../utils/filter.js';
import { microToMilli, round } from '../../utils/units.js';
import type { LoadedTrace } from '../loader.js';
import type { InitiatorChainItem, NetworkRequestItem, NetworkResult } from '../types.js';

export type SyntheticNetworkRequest = NonNullable<
  LoadedTrace['parsedTrace']['data']['NetworkRequests']
>['byTime'][number];

export interface ExtractNetworkOptions {
  renderBlocking?: boolean;
  slowest?: number;
  initiatorChain?: string;
  timeRange?: TimeRange;
}

export function extractNetwork(
  loadedTrace: LoadedTrace,
  options?: ExtractNetworkOptions,
): NetworkResult {
  const { engine, parsedTrace } = loadedTrace;
  const renderBlockingOnly = options?.renderBlocking ?? false;
  const slowest = options?.slowest ?? 20;
  const initiatorTarget = options?.initiatorChain;
  const timeRange = options?.timeRange;

  const rawRequests = parsedTrace.data.NetworkRequests?.byTime || [];
  const result: NetworkResult = {
    requests: [],
  };

  // 1. Check Initiator Chain if requested
  if (initiatorTarget) {
    const targetReq = rawRequests.find(
      (r) =>
        r.args.data.requestId === initiatorTarget ||
        Boolean(r.args.data.url.includes(initiatorTarget)),
    );

    if (targetReq) {
      const chain: InitiatorChainItem[] = [];
      let current: SyntheticNetworkRequest | undefined = targetReq;
      const visited = new Set<SyntheticNetworkRequest>();

      while (current && !visited.has(current)) {
        visited.add(current);
        const url = current.args.data.url || current.name || 'Unknown';
        const initiator = engine.Extras.Initiators.getNetworkInitiator(parsedTrace.data, current);
        const initiatorUrl = initiator?.args.data.url || initiator?.name;

        chain.push({
          url,
          initiatorUrl,
          type: current.args.data.mimeType || current.name,
        });

        current = initiator;
      }

      result.initiatorChain = chain;
    }
  }

  // 2. Identify render-blocking requests from insights if available
  const blockingUrls = new Set<string>();
  if (parsedTrace.insights) {
    for (const val of parsedTrace.insights.values()) {
      const insight = val.model || val;
      if (insight?.RenderBlocking?.renderBlockingRequests) {
        for (const req of insight.RenderBlocking.renderBlockingRequests) {
          if (req.args?.data?.url) {
            blockingUrls.add(req.args.data.url);
          }
        }
      }
    }
  }

  // 3. Process requests
  const processed: NetworkRequestItem[] = [];

  for (const req of rawRequests) {
    const startMs = microToMilli(req.ts);
    const durMs = microToMilli(req.dur ?? 0);
    const url: string = req.args.data.url;

    if (!isEventInBounds(startMs, durMs, timeRange)) {
      continue;
    }

    const isBlocking =
      req.args.data.renderBlocking === 'blocking' ||
      req.args.data.renderBlocking === 'in_body_parser_blocking' ||
      blockingUrls.has(url);

    if (renderBlockingOnly && !isBlocking) {
      continue;
    }

    const syn = req.args.data.syntheticData;
    const queueingMs = syn?.queueing ? microToMilli(syn.queueing) : 0;
    const dnsMs = syn?.dnsLookup ? microToMilli(syn.dnsLookup) : 0;
    const sslMs = syn?.ssl ? microToMilli(syn.ssl) : 0;
    const ttfbMs = syn?.waiting ? microToMilli(syn.waiting) : 0;
    const downloadMs = syn?.download ? microToMilli(syn.download) : 0;

    processed.push({
      requestId: req.args.data.requestId,
      url,
      mimeType: req.args.data.mimeType || '',
      priority: req.args.data.priority || 'Normal',
      timing: {
        queueingMs: round(queueingMs),
        dnsMs: round(dnsMs),
        sslMs: round(sslMs),
        ttfbMs: round(ttfbMs),
        downloadMs: round(downloadMs),
        totalDurationMs: round(durMs),
      },
      transferSizeBytes: req.args.data.encodedDataLength ?? 0,
      renderBlocking: isBlocking,
    });
  }

  // Sort by totalDurationMs descending
  processed.sort((a, b) => b.timing.totalDurationMs - a.timing.totalDurationMs);
  result.requests = processed.slice(0, slowest);

  return result;
}
