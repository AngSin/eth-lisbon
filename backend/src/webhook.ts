import crypto from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { AppConfig } from "./config.js";
import { json, lowerCaseHeaders } from "./http.js";
import { normalizeInodraPayload, processProtocolEvent, validateInodraPayload, type InodraPayload } from "./events.js";
import type { Repository } from "./types.js";
import type { WebhookSecrets } from "./secrets.js";

export async function handleInodraWebhook(
  event: APIGatewayProxyEventV2,
  config: AppConfig,
  repository: Repository,
  secrets: WebhookSecrets,
  now = new Date(),
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = rawBody(event);
  const headers = lowerCaseHeaders(event.headers);
  const signature = headers["x-inodra-signature"];
  const timestamp = headers["x-inodra-timestamp"];
  if (!body || !signature || !timestamp) {
    return json(400, { error: "missing webhook body or signature headers" });
  }

  if (!timestampWithinTolerance(timestamp, now, config.webhookTimestampToleranceSeconds)) {
    return json(401, { error: "webhook timestamp outside tolerance" });
  }

  const matchedSecret = matchSecret(
    secrets,
    signature,
    timestamp,
    body,
    headers["x-inodra-webhook-id"] ?? headers["x-webhook-id"],
  );
  if (!matchedSecret) return json(401, { error: "invalid signature" });

  let payload: InodraPayload;
  try {
    payload = normalizeInodraPayload(JSON.parse(body) as InodraPayload);
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const validationError = validateInodraPayload(payload, config);
  if (validationError) return json(400, { error: validationError });

  const dedupeKey = headers["x-dedupe-key"] ?? payload.id;
  if (!dedupeKey) return json(400, { error: "missing dedupe key" });

  const receivedAt = now.toISOString();
  const receiptStatus = await repository.createReceipt({
    dedupeKey,
    eventId: payload.id,
    transactionDigest: payload.transactionDigest ?? payload.txDigest ?? payload.digest,
    eventSequence: stringOrUndefined(payload.eventSequence ?? payload.eventSeq),
    eventType: payload.type,
    checkpoint: stringOrUndefined(payload.checkpoint),
    processingStatus: "processing",
    receivedAt,
  });
  if (receiptStatus === "duplicate") return json(200, { duplicate: true });

  await processProtocolEvent(payload, repository, receivedAt);
  await repository.markReceiptProcessed(dedupeKey);
  return json(202, { accepted: true });
}

function rawBody(event: APIGatewayProxyEventV2): string {
  const body = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function timestampWithinTolerance(
  timestamp: string,
  now: Date,
  toleranceSeconds: number,
): boolean {
  const timestampMs = /^\d+$/.test(timestamp)
    ? Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1)
    : Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  return Math.abs(now.getTime() - timestampMs) <= toleranceSeconds * 1000;
}

function matchSecret(
  secrets: WebhookSecrets,
  signature: string,
  timestamp: string,
  body: string,
  webhookId?: string,
): string | null {
  const candidates = webhookId && secrets[webhookId]
    ? [[webhookId, secrets[webhookId]]]
    : Object.entries(secrets);

  let match: string | null = null;
  for (const [key, secret] of candidates) {
    if (
      signatureMatches(secret, signature, body) ||
      signatureMatches(secret, signature, `${timestamp}.${body}`) ||
      inodraSignatureMatches(secret, signature, body)
    ) {
      if (match) return null;
      match = key;
    }
  }
  return match;
}

function signatureMatches(secret: string, signature: string, payload: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const provided = decodeSignature(signature);
  return provided !== null && provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function inodraSignatureMatches(secret: string, signature: string, body: string): boolean {
  const parsed = parseInodraSignature(signature);
  if (!parsed) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${body}`)
    .digest();
  const provided = Buffer.from(parsed.signature, "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function parseInodraSignature(signature: string): { timestamp: string; signature: string } | null {
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !/^[a-f0-9]{64}$/i.test(v1 ?? "")) return null;
  return { timestamp, signature: v1 };
}

function decodeSignature(signature: string): Buffer | null {
  const normalized = signature.trim().replace(/^sha256=/, "");
  if (/^[a-f0-9]{64}$/i.test(normalized)) return Buffer.from(normalized, "hex");
  try {
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}

function stringOrUndefined(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}
