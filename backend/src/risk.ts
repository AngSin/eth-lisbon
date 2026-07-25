import type { RiskLevel } from "./types.js";

export interface RiskScoreInput {
  principalAmount: string;
  fixedInterestAmount: string;
  collateralAmount: string;
  durationMs: number;
  btcUsdPrice: string;
}

export interface RiskScore {
  startingLtvBps: number;
  collateralBufferBps: number;
  breakEvenDrawdownBps: number;
  durationBucket: "short" | "medium" | "long";
  interestBps: number;
  riskLevel: RiskLevel;
  warning: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BPS = 10_000n;
const BTC_DECIMALS = 8n;
const USD_DECIMALS = 6n;

export function computeRiskScore(input: RiskScoreInput): RiskScore {
  const principal = parsePositiveBigInt(input.principalAmount, "principalAmount");
  const interest = parseNonNegativeBigInt(
    input.fixedInterestAmount,
    "fixedInterestAmount",
  );
  const collateral = parsePositiveBigInt(
    input.collateralAmount,
    "collateralAmount",
  );
  const btcUsdPrice = parsePositiveBigInt(input.btcUsdPrice, "btcUsdPrice");
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
    throw new Error("durationMs must be positive");
  }

  const totalDue = principal + interest;
  const collateralUsd = (collateral * btcUsdPrice) / 10n ** BTC_DECIMALS;
  if (collateralUsd <= 0n) throw new Error("collateral USD value is zero");

  const startingLtvBps = bps(principal, collateralUsd);
  const collateralBufferBps = bps(collateralUsd, totalDue);
  const breakEvenDrawdownBps =
    collateralUsd <= totalDue ? 0 : Number(((collateralUsd - totalDue) * BPS) / collateralUsd);
  const interestBps = bps(interest, principal);
  const durationDays = input.durationMs / DAY_MS;
  const durationBucket =
    durationDays <= 30 ? "short" : durationDays <= 90 ? "medium" : "long";

  let riskLevel: RiskLevel = "low";
  if (startingLtvBps > 8_500 || collateralBufferBps <= 11_500) {
    riskLevel = "critical";
  } else if (
    startingLtvBps > 7_000 ||
    durationDays > 90 ||
    (durationDays > 30 && interestBps < 500)
  ) {
    riskLevel = "high";
  } else if (startingLtvBps > 5_000 || durationDays > 30) {
    riskLevel = "medium";
  }

  return {
    startingLtvBps,
    collateralBufferBps,
    breakEvenDrawdownBps,
    durationBucket,
    interestBps,
    riskLevel,
    warning:
      "This is a no-liquidation loan. BTC price movement will not trigger liquidation; the lender bears market risk until repayment or default claim at maturity.",
  };
}

function parsePositiveBigInt(value: string, name: string): bigint {
  const parsed = parseNonNegativeBigInt(value, name);
  if (parsed <= 0n) throw new Error(`${name} must be positive`);
  return parsed;
}

function parseNonNegativeBigInt(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer string`);
  return BigInt(value);
}

function bps(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) throw new Error("denominator cannot be zero");
  return Number((numerator * BPS) / denominator);
}

export const PRINCIPAL_DECIMALS = USD_DECIMALS;
