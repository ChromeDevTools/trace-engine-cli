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

/**
 * Converts microseconds to milliseconds.
 */
export function microToMilli(microseconds: number): number {
  return microseconds / 1000;
}

/**
 * Converts milliseconds to microseconds.
 */
export function milliToMicro(milliseconds: number): number {
  return milliseconds * 1000;
}

/**
 * Rounds a number to a specific number of decimal places.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Formats milliseconds as a formatted string with unit suffix.
 */
export function formatMs(milliseconds: number, decimals = 2): string {
  return `${round(milliseconds, decimals)}ms`;
}

/**
 * Formats a byte count into human-readable size (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const absBytes = Math.abs(bytes);
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(absBytes) / Math.log(k))));
  const sign = bytes < 0 ? '-' : '';
  return `${sign}${round(absBytes / k ** i, 2)} ${sizes[i]}`;
}

/**
 * Formats a decimal score with fixed precision.
 */
export function formatScore(score: number, decimals = 4): string {
  return round(score, decimals).toString();
}
