import type { RiskLevel, RiskScore } from "./types";

const BPS = 10_000n;
const BTC_DECIMALS = 8n;

export function localRiskScore(input: {
  principalAmount: bigint;
  fixedInterestAmount: bigint;
  collateralAmount: bigint;
  durationMs: number;
  btcUsdPrice: bigint;
}): RiskScore {
  if (input.principalAmount <= 0n || input.collateralAmount <= 0n || input.btcUsdPrice <= 0n) {
    throw new Error("Amounts must be positive");
  }
  const totalDue = input.principalAmount + input.fixedInterestAmount;
  const collateralUsd = (input.collateralAmount * input.btcUsdPrice) / 10n ** BTC_DECIMALS;
  if (collateralUsd <= 0n) throw new Error("Collateral value is zero");

  const startingLtvBps = Number((input.principalAmount * BPS) / collateralUsd);
  const collateralBufferBps = Number((collateralUsd * BPS) / totalDue);
  const breakEvenDrawdownBps =
    collateralUsd <= totalDue ? 0 : Number(((collateralUsd - totalDue) * BPS) / collateralUsd);
  const interestBps = Number((input.fixedInterestAmount * BPS) / input.principalAmount);
  const durationDays = Math.trunc(input.durationMs / 86_400_000);
  const durationBucket = durationDays <= 30 ? "short" : durationDays <= 90 ? "medium" : "long";

  let riskLevel: RiskLevel = "low";
  if (startingLtvBps > 8500 || collateralBufferBps <= 11500) riskLevel = "critical";
  else if (startingLtvBps > 7000 || durationDays > 90 || (durationDays > 30 && interestBps < 500)) riskLevel = "high";
  else if (startingLtvBps > 5000 || durationDays > 30) riskLevel = "medium";

  return {
    startingLtvBps,
    collateralBufferBps,
    breakEvenDrawdownBps,
    durationBucket,
    interestBps,
    riskLevel,
    warning:
      "No liquidation will occur. The lender bears BTC market risk until repayment or default claim at maturity.",
  };
}
