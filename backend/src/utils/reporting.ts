export interface ReportDateRange {
  startDate?: string;
  endDate?: string;
}

function toDateBoundary(value: string, endOfDay: boolean): number {
  const normalized = endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
}

export function assertValidReportDateRange(range: ReportDateRange): void {
  if (!range.startDate && !range.endDate) {
    return;
  }
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (range.startDate) {
    startMs = toDateBoundary(range.startDate, false);
  }
  if (range.endDate) {
    endMs = toDateBoundary(range.endDate, true);
  }
  if (startMs != null && endMs != null && startMs > endMs) {
    throw new Error('startDate must be on or before endDate.');
  }
}

export function orderFallsWithinRange(createdAt: string, range: ReportDateRange): boolean {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) {
    return false;
  }
  if (range.startDate && createdMs < toDateBoundary(range.startDate, false)) {
    return false;
  }
  if (range.endDate && createdMs > toDateBoundary(range.endDate, true)) {
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
