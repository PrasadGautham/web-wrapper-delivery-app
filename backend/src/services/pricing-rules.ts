import { DistancePricingRule } from '../domain/models.js';

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizePricingRule(rule: DistancePricingRule): DistancePricingRule {
  return {
    baseAmount: roundMoney(rule.baseAmount),
    includedDistanceKm: Number(rule.includedDistanceKm.toFixed(2)),
    additionalPerKm: roundMoney(rule.additionalPerKm),
  };
}

export function assertValidPricingRule(rule: DistancePricingRule, label: string): void {
  if (
    typeof rule.baseAmount !== 'number' ||
    Number.isNaN(rule.baseAmount) ||
    rule.baseAmount < 0 ||
    typeof rule.includedDistanceKm !== 'number' ||
    Number.isNaN(rule.includedDistanceKm) ||
    rule.includedDistanceKm < 0 ||
    typeof rule.additionalPerKm !== 'number' ||
    Number.isNaN(rule.additionalPerKm) ||
    rule.additionalPerKm < 0
  ) {
    throw new Error(`${label} must use non-negative numeric values.`);
  }
}

export function calculatePricingAmount(rule: DistancePricingRule, distanceKm: number): number {
  const extraDistance = Math.max(0, distanceKm - rule.includedDistanceKm);
  return roundMoney(rule.baseAmount + extraDistance * rule.additionalPerKm);
}

export function summarizePricingRule(rule: DistancePricingRule, currency: string): string {
  const base = `${currency} ${rule.baseAmount.toFixed(2)}`;
  if (rule.additionalPerKm <= 0) {
    return `${base} flat per delivery`;
  }
  return `${base} includes ${rule.includedDistanceKm.toFixed(1)} km, then ${currency} ${rule.additionalPerKm.toFixed(2)} per extra km`;
}
