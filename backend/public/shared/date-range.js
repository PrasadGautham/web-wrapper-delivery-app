export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function dateOffsetIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthStartIso() {
  const date = new Date();
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}

export function resolveDateRange(filterState) {
  const preset = filterState.preset;
  if (preset === 'all') return {};
  if (preset === 'today') {
    const today = todayIso();
    return { startDate: today, endDate: today };
  }
  if (preset === 'last7') return { startDate: dateOffsetIso(-6), endDate: todayIso() };
  if (preset === 'last30') return { startDate: dateOffsetIso(-29), endDate: todayIso() };
  if (preset === 'thisMonth') return { startDate: monthStartIso(), endDate: todayIso() };
  return {
    startDate: filterState.startDate || undefined,
    endDate: filterState.endDate || undefined,
  };
}

export function buildRangeQueryString(filterState) {
  const params = new URLSearchParams();
  const range = resolveDateRange(filterState);
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function describeDateRange(range) {
  if (!range.startDate && !range.endDate) return 'Showing all available dates.';
  if (range.startDate && range.endDate) return `Showing data from ${range.startDate} to ${range.endDate}.`;
  return `Showing data ${range.startDate ? `from ${range.startDate}` : `until ${range.endDate}`}.`;
}
