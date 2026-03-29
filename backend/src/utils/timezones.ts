export const defaultTenantCurrency = 'AED';
export const defaultTenantTimeZone = 'Asia/Dubai';
export const platformReportTimeZone = 'UTC';
export const defaultDistanceUnit = 'kilometer';

function parseOffsetMinutes(value: string): number {
  const normalized = value.replace('GMT', '');
  if (!normalized || normalized === 'Z') {
    return 0;
  }
  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return 0;
  }
  const [, sign, hours, minutes] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes ?? '0');
  return sign === '-' ? -totalMinutes : totalMinutes;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTenantCurrency(value: unknown): string {
  if (typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim().toUpperCase())) {
    return value.trim().toUpperCase();
  }
  return defaultTenantCurrency;
}

export function normalizeTenantTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? value : defaultTenantTimeZone;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const timeZoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  return parseOffsetMinutes(timeZoneName);
}

export function localDateBoundaryToUtc(dateValue: string, timeZone: string, endOfDay = false): number {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date value: ${dateValue}`);
  }
  const [, year, month, day] = match;
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  let guess = Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute, second, millisecond);
  for (let index = 0; index < 3; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
    const nextGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute, second, millisecond) - offsetMinutes * 60 * 1000;
    if (nextGuess === guess) {
      break;
    }
    guess = nextGuess;
  }
  return guess;
}

export function extractDateInTimeZone(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

export function formatDateTimeInTimeZone(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateInTimeZone(value: string | Date, timeZone: string): string {
  return extractDateInTimeZone(value, timeZone);
}
