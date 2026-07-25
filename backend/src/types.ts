export type RiskLevel = "low" | "medium" | "high" | "critical";

export type OfferStatus = "open" | "cancelled" | "accepted";
export type LoanStatus = "active" | "repaid" | "default_claimed";

export interface LoanOfferItem {
  offerId: string;
  offerObjectId: string;
  lender: string;
  principalAmount: string;
  fixedInterestAmount: string;
  totalDueAmount: string;
  collateralRequired: string;
  durationMs: number;
  expiresAtMs: number;
  createdAtMs: number;
  status: OfferStatus;
  riskLevel?: RiskLevel;
  startingLtvBps?: number;
  transactionDigest?: string;
  updatedAt: string;
}

export interface LoanItem {
  loanId: string;
  loanObjectId: string;
  offerId: string;
  offerObjectId: string;
  borrower: string;
  lender: string;
  principalAmount: string;
  fixedInterestAmount: string;
  totalDueAmount: string;
  collateralAmount: string;
  startedAtMs: number;
  maturityMs: number;
  maturityBucket: string;
  status: LoanStatus;
  transactionDigest?: string;
  updatedAt: string;
}

export interface WebhookReceiptItem {
  dedupeKey: string;
  eventId?: string;
  transactionDigest?: string;
  eventSequence?: string;
  eventType?: string;
  checkpoint?: string;
  processingStatus: "processing" | "processed";
  receivedAt: string;
}

export interface OffersQuery {
  lender?: string;
  status?: OfferStatus;
  riskLevel?: RiskLevel;
  minPrincipal?: bigint;
  maxPrincipal?: bigint;
  minDurationMs?: number;
  maxDurationMs?: number;
  minLtvBps?: number;
  maxLtvBps?: number;
}

export interface Repository {
  listOffers(query: OffersQuery): Promise<LoanOfferItem[]>;
  getLoan(loanId: string): Promise<LoanItem | null>;
  listAccountLoans(address: string): Promise<LoanItem[]>;
  createReceipt(receipt: WebhookReceiptItem): Promise<"created" | "retry" | "duplicate">;
  markReceiptProcessed(dedupeKey: string): Promise<void>;
  upsertOffer(offer: LoanOfferItem): Promise<void>;
  updateOfferStatus(input: {
    offerId: string;
    status: OfferStatus;
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void>;
  upsertLoan(loan: LoanItem): Promise<void>;
  updateLoanStatus(input: {
    loanId: string;
    status: LoanStatus;
    transactionDigest?: string;
    updatedAt: string;
  }): Promise<void>;
}
