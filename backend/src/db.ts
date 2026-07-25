import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  LoanItem,
  LoanOfferItem,
  OfferStatus,
  OffersQuery,
  Repository,
  WebhookReceiptItem,
} from "./types.js";

export const DYNAMO_INDEXES = {
  offersByStatus: "status-index",
  offersByLender: "lender-index",
  offersByRiskLevel: "riskLevel-index",
  loansByBorrower: "borrower-index",
  loansByLender: "lender-index",
  loansByStatus: "status-index",
  loansByMaturityBucket: "maturityBucket-index",
} as const;

export class DynamoRepository implements Repository {
  private readonly client: DynamoDBDocumentClient;

  constructor(
    private readonly tables: {
      loanOffersTable: string;
      loansTable: string;
      webhookReceiptsTable: string;
    },
    client = DynamoDBDocumentClient.from(new DynamoDBClient({})),
  ) {
    this.client = client;
  }

  async listOffers(query: OffersQuery): Promise<LoanOfferItem[]> {
    if (query.lender) {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tables.loanOffersTable,
          IndexName: DYNAMO_INDEXES.offersByLender,
          KeyConditionExpression: "#lender = :lender",
          ExpressionAttributeNames: { "#lender": "lender" },
          ExpressionAttributeValues: { ":lender": query.lender },
        }),
      );
      return filterOffers((result.Items ?? []) as LoanOfferItem[], query);
    }

    const status = query.status ?? "open";
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tables.loanOffersTable,
        IndexName: DYNAMO_INDEXES.offersByStatus,
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
      }),
    );
    return filterOffers((result.Items ?? []) as LoanOfferItem[], query);
  }

  async getLoan(loanId: string): Promise<LoanItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tables.loansTable,
        Key: { loanId },
      }),
    );
    return (result.Item as LoanItem | undefined) ?? null;
  }

  async listAccountLoans(address: string): Promise<LoanItem[]> {
    const [borrowed, lent] = await Promise.all([
      this.client.send(
        new QueryCommand({
          TableName: this.tables.loansTable,
          IndexName: DYNAMO_INDEXES.loansByBorrower,
          KeyConditionExpression: "#borrower = :address",
          ExpressionAttributeNames: { "#borrower": "borrower" },
          ExpressionAttributeValues: { ":address": address },
        }),
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.tables.loansTable,
          IndexName: DYNAMO_INDEXES.loansByLender,
          KeyConditionExpression: "#lender = :address",
          ExpressionAttributeNames: { "#lender": "lender" },
          ExpressionAttributeValues: { ":address": address },
        }),
      ),
    ]);

    const byId = new Map<string, LoanItem>();
    for (const item of [...(borrowed.Items ?? []), ...(lent.Items ?? [])] as LoanItem[]) {
      byId.set(item.loanId, item);
    }
    return [...byId.values()];
  }

  async createReceipt(receipt: WebhookReceiptItem): Promise<"created" | "retry" | "duplicate"> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tables.webhookReceiptsTable,
          Item: receipt,
          ConditionExpression: "attribute_not_exists(dedupeKey)",
        }),
      );
      return "created";
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        const existing = await this.client.send(
          new GetCommand({
            TableName: this.tables.webhookReceiptsTable,
            Key: { dedupeKey: receipt.dedupeKey },
          }),
        );
        return existing.Item?.processingStatus === "processed" ? "duplicate" : "retry";
      }
      throw error;
    }
  }

  async markReceiptProcessed(dedupeKey: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tables.webhookReceiptsTable,
        Key: { dedupeKey },
        UpdateExpression: "SET processingStatus = :status",
        ExpressionAttributeValues: { ":status": "processed" },
      }),
    );
  }

  async upsertOffer(offer: LoanOfferItem): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tables.loanOffersTable,
        Item: offer,
      }),
    );
  }

  async updateOfferStatus(input: {
    offerId: string;
    status: OfferStatus;
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void> {
    const set = ["#status = :status", "updatedAt = :updatedAt"];
    const values: Record<string, string> = {
      ":status": input.status,
      ":updatedAt": input.updatedAt,
    };
    if (input.transactionDigest) {
      set.push("transactionDigest = :transactionDigest");
      values[":transactionDigest"] = input.transactionDigest;
    }
    await this.client.send(
      new UpdateCommand({
        TableName: this.tables.loanOffersTable,
        Key: { offerId: input.offerId },
        UpdateExpression: `SET ${set.join(", ")}`,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: values,
      }),
    );
  }

  async upsertLoan(loan: LoanItem): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tables.loansTable,
        Item: loan,
      }),
    );
  }

  async updateLoanStatus(input: {
    loanId: string;
    status: LoanItem["status"];
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void> {
    const set = ["#status = :status", "updatedAt = :updatedAt"];
    const values: Record<string, string> = {
      ":status": input.status,
      ":updatedAt": input.updatedAt,
    };
    if (input.transactionDigest) {
      set.push("transactionDigest = :transactionDigest");
      values[":transactionDigest"] = input.transactionDigest;
    }
    await this.client.send(
      new UpdateCommand({
        TableName: this.tables.loansTable,
        Key: { loanId: input.loanId },
        UpdateExpression: `SET ${set.join(", ")}`,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: values,
      }),
    );
  }
}

function filterOffers(offers: LoanOfferItem[], query: OffersQuery): LoanOfferItem[] {
  return offers.filter((offer) => {
    if (query.status && offer.status !== query.status) return false;
    if (!query.status && offer.status !== "open") return false;
    if (query.lender && offer.lender !== query.lender) return false;
    if (query.riskLevel && offer.riskLevel !== query.riskLevel) return false;
    if (query.minPrincipal !== undefined && BigInt(offer.principalAmount) < query.minPrincipal) return false;
    if (query.maxPrincipal !== undefined && BigInt(offer.principalAmount) > query.maxPrincipal) return false;
    if (query.minDurationMs !== undefined && offer.durationMs < query.minDurationMs) return false;
    if (query.maxDurationMs !== undefined && offer.durationMs > query.maxDurationMs) return false;
    if (query.minLtvBps !== undefined && (offer.startingLtvBps ?? 0) < query.minLtvBps) return false;
    if (query.maxLtvBps !== undefined && (offer.startingLtvBps ?? 0) > query.maxLtvBps) return false;
    return true;
  });
}

export class InMemoryRepository implements Repository {
  readonly offers = new Map<string, LoanOfferItem>();
  readonly loans = new Map<string, LoanItem>();
  readonly receipts = new Map<string, WebhookReceiptItem>();

  async listOffers(query: OffersQuery): Promise<LoanOfferItem[]> {
    return [...this.offers.values()].filter((offer) => {
      if (query.status && offer.status !== query.status) return false;
      if (!query.status && offer.status !== "open") return false;
      if (query.lender && offer.lender !== query.lender) return false;
      if (query.riskLevel && offer.riskLevel !== query.riskLevel) return false;
      if (query.minPrincipal !== undefined && BigInt(offer.principalAmount) < query.minPrincipal) return false;
      if (query.maxPrincipal !== undefined && BigInt(offer.principalAmount) > query.maxPrincipal) return false;
      if (query.minDurationMs !== undefined && offer.durationMs < query.minDurationMs) return false;
      if (query.maxDurationMs !== undefined && offer.durationMs > query.maxDurationMs) return false;
      if (query.minLtvBps !== undefined && (offer.startingLtvBps ?? 0) < query.minLtvBps) return false;
      if (query.maxLtvBps !== undefined && (offer.startingLtvBps ?? 0) > query.maxLtvBps) return false;
      return true;
    });
  }

  async getLoan(loanId: string): Promise<LoanItem | null> {
    return this.loans.get(loanId) ?? null;
  }

  async listAccountLoans(address: string): Promise<LoanItem[]> {
    return [...this.loans.values()].filter(
      (loan) => loan.borrower === address || loan.lender === address,
    );
  }

  async createReceipt(receipt: WebhookReceiptItem): Promise<"created" | "retry" | "duplicate"> {
    const existing = this.receipts.get(receipt.dedupeKey);
    if (existing?.processingStatus === "processed") return "duplicate";
    if (existing) return "retry";
    this.receipts.set(receipt.dedupeKey, receipt);
    return "created";
  }

  async markReceiptProcessed(dedupeKey: string): Promise<void> {
    const receipt = this.receipts.get(dedupeKey);
    if (receipt) receipt.processingStatus = "processed";
  }

  async upsertOffer(offer: LoanOfferItem): Promise<void> {
    this.offers.set(offer.offerId, offer);
  }

  async updateOfferStatus(input: {
    offerId: string;
    status: OfferStatus;
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void> {
    const offer = this.offers.get(input.offerId);
    if (offer) this.offers.set(input.offerId, { ...offer, ...input });
  }

  async upsertLoan(loan: LoanItem): Promise<void> {
    this.loans.set(loan.loanId, loan);
  }

  async updateLoanStatus(input: {
    loanId: string;
    status: LoanItem["status"];
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void> {
    const loan = this.loans.get(input.loanId);
    if (loan) this.loans.set(input.loanId, { ...loan, ...input });
  }
}
