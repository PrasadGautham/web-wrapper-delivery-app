import { DEFAULT_PLATFORM_TIME_ZONE } from './constants.js';

function zoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || DEFAULT_PLATFORM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parts.find((part) => part.type === 'year')?.value || '0000',
    month: parts.find((part) => part.type === 'month')?.value || '00',
    day: parts.find((part) => part.type === 'day')?.value || '00',
  };
}

function fromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function zonedDate(date, timeZone) {
  const parts = zoneParts(date, timeZone);
  return new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
}

export function todayIso(timeZone) {
  return fromParts(zoneParts(new Date(), timeZone));
}

export function dateOffsetIso(days, timeZone) {
  const base = zonedDate(new Date(), timeZone);
  base.setUTCDate(base.getUTCDate() + days);
  return fromParts(zoneParts(base, timeZone));
}

export function monthStartIso(timeZone) {
  const today = zoneParts(new Date(), timeZone);
  return `${today.year}-${today.month}-01`;
}

export function resolveDateRange(filterState, timeZone) {
  const preset = filterState.preset;
  if (preset === 'all') return {};
  if (preset === 'today') {
    const today = todayIso(timeZone);
    return { startDate: today, endDate: today };
  }
  if (preset === 'last7') return { startDate: dateOffsetIso(-6, timeZone), endDate: todayIso(timeZone) };
  if (preset === 'last30') return { startDate: dateOffsetIso(-29, timeZone), endDate: todayIso(timeZone) };
  if (preset === 'thisMonth') return { startDate: monthStartIso(timeZone), endDate: todayIso(timeZone) };
  return {
    startDate: filterState.startDate || undefined,
    endDate: filterState.endDate || undefined,
  };
}

export function buildRangeQueryString(filterState, timeZone) {
  const params = new URLSearchParams();
  const range = resolveDateRange(filterState, timeZone);
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function describeDateRange(range, timeZone) {
  const suffix = timeZone ? ` (${timeZone})` : '';
  if (!range.startDate && !range.endDate) return `Showing all available dates${suffix}.`;
  if (range.startDate && range.endDate) return `Showing data from ${range.startDate} to ${range.endDate}${suffix}.`;
  return `Showing data ${range.startDate ? `from ${range.startDate}` : `until ${range.endDate}`}${suffix}.`;
}

