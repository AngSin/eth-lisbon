import assert from "node:assert/strict";
import test from "node:test";
import { computeRiskScore } from "../risk.js";

test("computes low risk for conservative short duration offer", () => {
  const score = computeRiskScore({
    principalAmount: "1000000000",
    fixedInterestAmount: "50000000",
    collateralAmount: "5000000",
    durationMs: 14 * 24 * 60 * 60 * 1000,
    btcUsdPrice: "60000000000",
  });

  assert.equal(score.riskLevel, "low");
  assert.equal(score.durationBucket, "short");
  assert.equal(score.startingLtvBps, 3333);
  assert.match(score.warning, /no-liquidation loan/i);
});

test("marks high ltv offers critical", () => {
  const score = computeRiskScore({
    principalAmount: "9000000000",
    fixedInterestAmount: "100000000",
    collateralAmount: "10000000",
    durationMs: 14 * 24 * 60 * 60 * 1000,
    btcUsdPrice: "100000000000",
  });

  assert.equal(score.riskLevel, "critical");
});
