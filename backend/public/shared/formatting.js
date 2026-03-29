const MILES_PER_KILOMETER = 0.621371;
const KILOMETERS_PER_MILE = 1.609344;

export function normalizeCurrencyCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function formatMoney(value, currency = 'AED') {
  const code = normalizeCurrencyCode(currency) || 'AED';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatStatus(value) {
  if (!value) return 'Unknown';
  if (value === 'inTransit') return 'In transit';
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export function formatMinutes(value) {
  if (value == null) return 'Not available';
  return `${value} min`;
}

export function formatEtaSource(value) {
  if (!value || value === 'not-available') return 'Not available';
  if (value === 'static-estimate') return 'Static estimate';
  if (value === 'live-driver-location') return 'Live driver location';
  if (value === 'google-routes') return 'Google traffic routing';
  return value;
}

export function toDisplayDistance(kmValue, unit = 'kilometer') {
  const numeric = Number(kmValue || 0);
  return unit === 'mile' ? numeric * MILES_PER_KILOMETER : numeric;
}

export function fromDisplayDistance(displayValue, unit = 'kilometer') {
  const numeric = Number(displayValue || 0);
  return unit === 'mile' ? numeric * KILOMETERS_PER_MILE : numeric;
}

export function toDisplayRate(perKmValue, unit = 'kilometer') {
  const numeric = Number(perKmValue || 0);
  return unit === 'mile' ? numeric * KILOMETERS_PER_MILE : numeric;
}

export function fromDisplayRate(displayRate, unit = 'kilometer') {
  const numeric = Number(displayRate || 0);
  return unit === 'mile' ? numeric / KILOMETERS_PER_MILE : numeric;
}

export function distanceUnitShort(unit = 'kilometer') {
  return unit === 'mile' ? 'mi' : 'km';
}

export function distanceUnitWord(unit = 'kilometer') {
  return unit === 'mile' ? 'mile' : 'km';
}

export function formatDistance(kmValue, unit = 'kilometer') {
  return `${toDisplayDistance(kmValue, unit).toFixed(1)} ${distanceUnitShort(unit)}`;
}

export function summarizePricingRule(rule, currency, unit = 'kilometer') {
  const included = toDisplayDistance(rule.includedDistanceKm || 0, unit);
  const extraRate = toDisplayRate(rule.additionalPerKm || 0, unit);
  if (Number(extraRate) <= 0) {
    return `${formatMoney(rule.baseAmount, currency)} flat per delivery`;
  }
  return `${formatMoney(rule.baseAmount, currency)} includes ${included.toFixed(1)} ${distanceUnitShort(unit)}, then ${formatMoney(extraRate, currency)} per extra ${distanceUnitWord(unit)}`;
}
