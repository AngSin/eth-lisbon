import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { loadConfig, type AppConfig } from "../config.js";
import { DynamoRepository } from "../db.js";
import { json, parseJsonBody } from "../http.js";
import { computeRiskScore, type RiskScoreInput } from "../risk.js";
import type { OfferStatus, Repository, RiskLevel } from "../types.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const config = loadConfig();
  const repository = new DynamoRepository(config);
  return handleApi(event, config, repository);
}

export async function handleApi(
  event: APIGatewayProxyEventV2,
  config: AppConfig,
  repository: Repository,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  try {
    if (method === "GET" && path === "/health") {
      return json(200, { ok: true });
    }
    if (method === "GET" && path === "/config") {
      return json(200, {
        apiVersion: config.apiVersion,
        suiNetwork: config.suiNetwork,
        suiRpcUrl: config.suiRpcUrl,
        suiPackageId: config.suiPackageId,
        suiRegistryObjectId: config.suiRegistryObjectId,
        collateralCoinType: config.collateralCoinType,
        principalCoinType: config.principalCoinType,
      });
    }
    if (method === "GET" && path === "/offers") {
      const query = event.queryStringParameters ?? {};
      return json(200, {
        offers: await repository.listOffers({
          lender: query.lender,
          status: parseOfferStatus(query.status),
          riskLevel: parseRiskLevel(query.riskLevel),
          minPrincipal: parseOptionalBigInt(query.minPrincipal),
          maxPrincipal: parseOptionalBigInt(query.maxPrincipal),
          minDurationMs: parseOptionalNumber(query.minDurationMs),
          maxDurationMs: parseOptionalNumber(query.maxDurationMs),
          minLtvBps: parseOptionalNumber(query.minLtvBps),
          maxLtvBps: parseOptionalNumber(query.maxLtvBps),
        }),
      });
    }
    if (method === "GET" && path.startsWith("/loans/")) {
      const loanId = decodeURIComponent(path.slice("/loans/".length));
      const loan = await repository.getLoan(loanId);
      return loan ? json(200, { loan }) : json(404, { error: "loan not found" });
    }
    if (method === "GET" && path.startsWith("/accounts/") && path.endsWith("/loans")) {
      const address = decodeURIComponent(path.slice("/accounts/".length, -"/loans".length));
      return json(200, { loans: await repository.listAccountLoans(address) });
    }
    if (method === "POST" && path === "/risk-score") {
      const body = parseJsonBody<RiskScoreInput>(event.body);
      if (!body) return json(400, { error: "invalid JSON body" });
      return json(200, computeRiskScore(body));
    }
    return json(404, { error: "not found" });
  } catch (error) {
    if (error instanceof Error) return json(400, { error: error.message });
    return json(500, { error: "internal error" });
  }
}

function parseOfferStatus(value: string | undefined): OfferStatus | undefined {
  if (value === undefined) return undefined;
  if (value === "open" || value === "cancelled" || value === "accepted") return value;
  throw new Error("invalid offer status");
}

function parseRiskLevel(value: string | undefined): RiskLevel | undefined {
  if (value === undefined) return undefined;
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new Error("invalid risk level");
}

function parseOptionalBigInt(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error("integer query parameter expected");
  return BigInt(value);
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("numeric query parameter expected");
  return parsed;
}
