export type RiskLevel = "low" | "medium" | "high" | "critical";
export type OfferStatus = "open" | "cancelled" | "accepted";
export type LoanStatus = "active" | "repaid" | "default_claimed";

export interface AppConfig {
  apiVersion: string;
  suiNetwork: "mainnet" | "testnet" | "devnet" | "localnet" | string;
  suiRpcUrl: string;
  suiPackageId: string;
  suiRegistryObjectId: string;
  collateralCoinType: string;
  principalCoinType: string;
}

export interface MarketPrice {
  source: "livecoinwatch";
  base: "BTC";
  quote: "USDC";
  rate: string;
  updatedAt: string;
}

export interface LoanOffer {
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
}

export interface Loan {
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
  status: LoanStatus;
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
