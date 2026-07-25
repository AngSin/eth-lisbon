import type { AppConfig } from "./config.js";
import type { LoanItem, LoanOfferItem, Repository } from "./types.js";

export interface InodraPayload {
  payloadVersion: number;
  id?: string;
  activityType: string;
  type: string;
  transactionDigest?: string;
  digest?: string;
  eventSequence?: string | number;
  eventSeq?: string | number;
  checkpoint?: string | number;
  parsedJson?: Record<string, unknown>;
  data?: Record<string, unknown>;
  event?: { parsedJson?: Record<string, unknown> };
}

export function allowedEventTypes(config: AppConfig): Set<string> {
  const packageIds = new Set([config.suiPackageId]);
  if (config.suiEventPackageId) packageIds.add(config.suiEventPackageId);

  return new Set(
    [...packageIds].flatMap((packageId) => {
      const prefix = `${packageId}::protocol::`;
      return [
        `${prefix}OfferCreated`,
        `${prefix}OfferCancelled`,
        `${prefix}LoanCreated`,
        `${prefix}LoanRepaid`,
        `${prefix}CollateralClaimed`,
      ];
    }),
  );
}

export function validateInodraPayload(
  payload: InodraPayload,
  config: AppConfig,
): string | null {
  if (payload.payloadVersion !== 1) return "payloadVersion must be 1";
  if (payload.activityType !== "package_event") {
    return "activityType must be package_event";
  }
  if (!allowedEventTypes(config).has(payload.type)) {
    return "payload type is not an allowed protocol event";
  }
  return null;
}

export async function processProtocolEvent(
  payload: InodraPayload,
  repository: Repository,
  receivedAt: string,
): Promise<void> {
  const eventName = payload.type.split("::").at(-1);
  const fields = eventFields(payload);
  const transactionDigest = payload.transactionDigest ?? payload.digest;

  switch (eventName) {
    case "OfferCreated":
      await repository.upsertOffer(toOffer(fields, transactionDigest, receivedAt));
      return;
    case "OfferCancelled":
      await repository.updateOfferStatus({
        offerId: stringField(fields, "offer_id"),
        status: "cancelled",
        transactionDigest,
        updatedAt: receivedAt,
      });
      return;
    case "LoanCreated":
      await repository.updateOfferStatus({
        offerId: stringField(fields, "offer_id"),
        status: "accepted",
        transactionDigest,
        updatedAt: receivedAt,
      });
      await repository.upsertLoan(toLoan(fields, transactionDigest, receivedAt));
      return;
    case "LoanRepaid":
      await repository.updateLoanStatus({
        loanId: stringField(fields, "loan_id"),
        status: "repaid",
        transactionDigest,
        updatedAt: receivedAt,
      });
      return;
    case "CollateralClaimed":
      await repository.updateLoanStatus({
        loanId: stringField(fields, "loan_id"),
        status: "default_claimed",
        transactionDigest,
        updatedAt: receivedAt,
      });
      return;
    default:
      throw new Error(`unsupported event ${eventName ?? payload.type}`);
  }
}

function toOffer(
  fields: Record<string, unknown>,
  transactionDigest: string | undefined,
  updatedAt: string,
): LoanOfferItem {
  return {
    offerId: stringField(fields, "offer_id"),
    offerObjectId: stringField(fields, "offer_object_id"),
    lender: stringField(fields, "lender"),
    principalAmount: stringField(fields, "principal_amount"),
    fixedInterestAmount: stringField(fields, "fixed_interest_amount"),
    totalDueAmount: stringField(fields, "total_due_amount"),
    collateralRequired: stringField(fields, "collateral_required"),
    durationMs: numberField(fields, "duration_ms"),
    expiresAtMs: numberField(fields, "expires_at_ms"),
    createdAtMs: numberField(fields, "created_at_ms"),
    status: "open",
    transactionDigest,
    updatedAt,
  };
}

function toLoan(
  fields: Record<string, unknown>,
  transactionDigest: string | undefined,
  updatedAt: string,
): LoanItem {
  const maturityMs = numberField(fields, "maturity_ms");
  return {
    loanId: stringField(fields, "loan_id"),
    loanObjectId: stringField(fields, "loan_object_id"),
    offerId: stringField(fields, "offer_id"),
    offerObjectId: stringField(fields, "offer_object_id"),
    borrower: stringField(fields, "borrower"),
    lender: stringField(fields, "lender"),
    principalAmount: stringField(fields, "principal_amount"),
    fixedInterestAmount: stringField(fields, "fixed_interest_amount"),
    totalDueAmount: stringField(fields, "total_due_amount"),
    collateralAmount: stringField(fields, "collateral_amount"),
    startedAtMs: numberField(fields, "started_at_ms"),
    maturityMs,
    maturityBucket: new Date(maturityMs).toISOString().slice(0, 10),
    status: "active",
    transactionDigest,
    updatedAt,
  };
}

function eventFields(payload: InodraPayload): Record<string, unknown> {
  const fields = payload.parsedJson ?? payload.data ?? payload.event?.parsedJson;
  if (!fields || typeof fields !== "object") {
    throw new Error("payload event fields are missing");
  }
  return fields;
}

function stringField(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  throw new Error(`missing string field ${name}`);
}

function numberField(fields: Record<string, unknown>, name: string): number {
  const value = fields[name];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error(`invalid number field ${name}`);
  return parsed;
}
