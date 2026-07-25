import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import { InMemoryRepository } from "../db.js";
import { handleInodraWebhook } from "../webhook.js";

const packageId = "0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142";
const now = new Date("2026-07-25T12:00:00.000Z");
const secret = "test-secret";

test("rejects invalid signatures before parsing JSON", async () => {
  const repository = new InMemoryRepository();
  const response = await handleInodraWebhook(
    webhookEvent("{not json", "bad-signature"),
    loadConfig({ SUI_PACKAGE_ID: packageId, INODRA_WEBHOOK_SECRET: secret }),
    repository,
    { default: secret },
    now,
  );

  assert.equal(response.statusCode, 401);
  assert.equal(repository.receipts.size, 0);
});

test("ingests OfferCreated once and returns duplicate on replay", async () => {
  const repository = new InMemoryRepository();
  const body = JSON.stringify({
    payloadVersion: 1,
    id: "event-1",
    activityType: "package_event",
    type: `${packageId}::protocol::OfferCreated`,
    transactionDigest: "tx1",
    eventSequence: "0",
    checkpoint: "10",
    parsedJson: {
      offer_id: "0",
      offer_object_id: "0xoffer",
      lender: "0xlender",
      principal_amount: "1000",
      fixed_interest_amount: "100",
      total_due_amount: "1100",
      collateral_required: "50",
      duration_ms: "1000",
      expires_at_ms: "2000",
      created_at_ms: "100",
    },
  });
  const signature = sign(body);
  const config = loadConfig({ SUI_PACKAGE_ID: packageId, INODRA_WEBHOOK_SECRET: secret });

  const first = await handleInodraWebhook(
    webhookEvent(body, signature),
    config,
    repository,
    { default: secret },
    now,
  );
  const second = await handleInodraWebhook(
    webhookEvent(body, signature),
    config,
    repository,
    { default: secret },
    now,
  );

  assert.equal(first.statusCode, 202);
  assert.equal(second.statusCode, 200);
  assert.equal(repository.offers.get("0")?.status, "open");
  assert.equal(repository.receipts.get("event-1")?.processingStatus, "processed");
});

test("LoanCreated accepts offer and creates active loan", async () => {
  const repository = new InMemoryRepository();
  await repository.upsertOffer({
    offerId: "0",
    offerObjectId: "0xoffer",
    lender: "0xlender",
    principalAmount: "1000",
    fixedInterestAmount: "100",
    totalDueAmount: "1100",
    collateralRequired: "50",
    durationMs: 1000,
    expiresAtMs: 2000,
    createdAtMs: 100,
    status: "open",
    updatedAt: now.toISOString(),
  });
  const body = JSON.stringify({
    payloadVersion: 1,
    id: "event-2",
    activityType: "package_event",
    type: `${packageId}::protocol::LoanCreated`,
    transactionDigest: "tx2",
    parsedJson: {
      offer_id: "0",
      offer_object_id: "0xoffer",
      loan_id: "7",
      loan_object_id: "0xloan",
      borrower: "0xborrower",
      lender: "0xlender",
      principal_amount: "1000",
      fixed_interest_amount: "100",
      total_due_amount: "1100",
      collateral_amount: "50",
      started_at_ms: "100",
      maturity_ms: "1100",
    },
  });

  const response = await handleInodraWebhook(
    webhookEvent(body, sign(body)),
    loadConfig({ SUI_PACKAGE_ID: packageId, INODRA_WEBHOOK_SECRET: secret }),
    repository,
    { default: secret },
    now,
  );

  assert.equal(response.statusCode, 202);
  assert.equal(repository.offers.get("0")?.status, "accepted");
  assert.equal(repository.loans.get("7")?.status, "active");
});

function sign(body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function webhookEvent(body: string, signature: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /webhooks/inodra/sui",
    rawPath: "/webhooks/inodra/sui",
    rawQueryString: "",
    headers: {
      "x-inodra-signature": signature,
      "x-inodra-timestamp": Math.floor(now.getTime() / 1000).toString(),
    },
    requestContext: {
      accountId: "test",
      apiId: "test",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: "POST",
        path: "/webhooks/inodra/sui",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test",
      },
      requestId: "test",
      routeKey: "POST /webhooks/inodra/sui",
      stage: "$default",
      time: "25/Jul/2026:12:00:00 +0000",
      timeEpoch: now.getTime(),
    },
    isBase64Encoded: false,
    body,
  };
}
