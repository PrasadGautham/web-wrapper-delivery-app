import { defaultTenantTimeZone, localDateBoundaryToUtc } from './timezones.js';

export interface ReportDateRange {
  startDate?: string;
  endDate?: string;
}

function toDateBoundary(value: string, endOfDay: boolean, timeZone: string): number {
  const parsed = localDateBoundaryToUtc(value, timeZone, endOfDay);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
}

export function assertValidReportDateRange(range: ReportDateRange, timeZone = defaultTenantTimeZone): void {
  if (!range.startDate && !range.endDate) {
    return;
  }
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (range.startDate) {
    startMs = toDateBoundary(range.startDate, false, timeZone);
  }
  if (range.endDate) {
    endMs = toDateBoundary(range.endDate, true, timeZone);
  }
  if (startMs != null && endMs != null && startMs > endMs) {
    throw new Error('startDate must be on or before endDate.');
  }
}

export function orderFallsWithinRange(createdAt: string, range: ReportDateRange, timeZone = defaultTenantTimeZone): boolean {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) {
    return false;
  }
  if (range.startDate && createdMs < toDateBoundary(range.startDate, false, timeZone)) {
    return false;
  }
  if (range.endDate && createdMs > toDateBoundary(range.endDate, true, timeZone)) {
    return false;
  }
  return true;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((value) => {
      const normalized = String(value ?? '');
      if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    }).join(','))
    .join('\n');
}
