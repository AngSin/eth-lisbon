import assert from "node:assert/strict";
import test from "node:test";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import { InMemoryRepository } from "../db.js";
import { handleApi } from "../handlers/api.js";

test("GET /config returns public Sui configuration", async () => {
  const config = loadConfig({
    SUI_PACKAGE_ID: "0xpackage",
    SUI_REGISTRY_OBJECT_ID: "0xregistry",
    COLLATERAL_COIN_TYPE: "0xcollateral::coin::COLLATERAL",
    PRINCIPAL_COIN_TYPE: "0xprincipal::coin::PRINCIPAL",
  });
  const response = await handleApi(apiEvent("GET", "/config"), config, new InMemoryRepository());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body ?? "{}"), {
    apiVersion: "2026-07-25",
    suiNetwork: "testnet",
    suiRpcUrl: "https://fullnode.testnet.sui.io:443",
    suiPackageId: "0xpackage",
    suiRegistryObjectId: "0xregistry",
    collateralCoinType: "0xcollateral::coin::COLLATERAL",
    principalCoinType: "0xprincipal::coin::PRINCIPAL",
  });
});

test("GET /offers returns open offers by default", async () => {
  const repository = new InMemoryRepository();
  await repository.upsertOffer({
    offerId: "1",
    offerObjectId: "0xoffer1",
    lender: "0xlender",
    principalAmount: "100",
    fixedInterestAmount: "10",
    totalDueAmount: "110",
    collateralRequired: "5",
    durationMs: 1000,
    expiresAtMs: 2000,
    createdAtMs: 0,
    status: "open",
    updatedAt: "2026-07-25T00:00:00.000Z",
  });
  await repository.upsertOffer({
    offerId: "2",
    offerObjectId: "0xoffer2",
    lender: "0xlender",
    principalAmount: "200",
    fixedInterestAmount: "10",
    totalDueAmount: "210",
    collateralRequired: "5",
    durationMs: 1000,
    expiresAtMs: 2000,
    createdAtMs: 0,
    status: "cancelled",
    updatedAt: "2026-07-25T00:00:00.000Z",
  });

  const response = await handleApi(apiEvent("GET", "/offers"), loadConfig({}), repository);
  const body = JSON.parse(response.body ?? "{}") as { offers: Array<{ offerId: string }> };

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.offers.map((offer) => offer.offerId), ["1"]);
});

function apiEvent(
  method: string,
  path: string,
  body?: unknown,
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "test",
      apiId: "test",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test",
      },
      requestId: "test",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "25/Jul/2026:00:00:00 +0000",
      timeEpoch: 1784937600000,
    },
    isBase64Encoded: false,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
