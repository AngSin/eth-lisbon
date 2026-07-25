import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { CLOCK_OBJECT_ID } from "./config";
import type { AppConfig, Loan, LoanOffer } from "./types";

export async function buildCreateOfferTx(input: {
  client: SuiJsonRpcClient;
  account: string;
  config: AppConfig;
  principalAmount: bigint;
  fixedInterestAmount: bigint;
  collateralRequired: bigint;
  durationMs: number;
  expiresAtMs: number;
}): Promise<Transaction> {
  ensureConfigured(input.config);
  const coinId = await findCoin(input.client, input.account, input.config.principalCoinType, input.principalAmount);
  const tx = new Transaction();
  tx.moveCall({
    target: `${input.config.suiPackageId}::protocol::create_offer`,
    typeArguments: [input.config.principalCoinType, input.config.collateralCoinType],
    arguments: [
      tx.object(input.config.suiRegistryObjectId),
      tx.object(coinId),
      tx.pure.u64(input.principalAmount),
      tx.pure.u64(input.fixedInterestAmount),
      tx.pure.u64(input.collateralRequired),
      tx.pure.u64(BigInt(input.durationMs)),
      tx.pure.u64(BigInt(input.expiresAtMs)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export async function buildAcceptOfferTx(input: {
  client: SuiJsonRpcClient;
  account: string;
  config: AppConfig;
  offer: LoanOffer;
}): Promise<Transaction> {
  ensureConfigured(input.config);
  const coinId = await findCoin(
    input.client,
    input.account,
    input.config.collateralCoinType,
    BigInt(input.offer.collateralRequired),
  );
  const tx = new Transaction();
  tx.moveCall({
    target: `${input.config.suiPackageId}::protocol::accept_offer`,
    typeArguments: [input.config.principalCoinType, input.config.collateralCoinType],
    arguments: [
      tx.object(input.config.suiRegistryObjectId),
      tx.object(input.offer.offerObjectId),
      tx.object(coinId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildCancelOfferTx(config: AppConfig, offer: LoanOffer): Transaction {
  ensureConfigured(config);
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.suiPackageId}::protocol::cancel_offer`,
    typeArguments: [config.principalCoinType, config.collateralCoinType],
    arguments: [tx.object(offer.offerObjectId), tx.object(CLOCK_OBJECT_ID)],
  });
  return tx;
}

export async function buildRepayTx(input: {
  client: SuiJsonRpcClient;
  account: string;
  config: AppConfig;
  loan: Loan;
}): Promise<Transaction> {
  ensureConfigured(input.config);
  const coinId = await findCoin(input.client, input.account, input.config.principalCoinType, BigInt(input.loan.totalDueAmount));
  const tx = new Transaction();
  tx.moveCall({
    target: `${input.config.suiPackageId}::protocol::repay`,
    typeArguments: [input.config.principalCoinType, input.config.collateralCoinType],
    arguments: [tx.object(input.loan.loanObjectId), tx.object(coinId), tx.object(CLOCK_OBJECT_ID)],
  });
  return tx;
}

export function buildClaimDefaultTx(config: AppConfig, loan: Loan): Transaction {
  ensureConfigured(config);
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.suiPackageId}::protocol::claim_default`,
    typeArguments: [config.principalCoinType, config.collateralCoinType],
    arguments: [tx.object(loan.loanObjectId), tx.object(CLOCK_OBJECT_ID)],
  });
  return tx;
}

export async function getCoinBalance(client: SuiJsonRpcClient, owner: string, coinType: string): Promise<bigint> {
  if (!coinType) return 0n;
  const balance = await client.getBalance({ owner, coinType });
  return BigInt(balance.totalBalance);
}

async function findCoin(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
  amount: bigint,
): Promise<string> {
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({ owner, coinType, cursor });
    const coin = page.data.find((item) => BigInt(item.balance) >= amount);
    if (coin) return coin.coinObjectId;
    cursor = page.nextCursor;
  } while (cursor);
  throw new Error("No single coin has enough balance for this transaction");
}

function ensureConfigured(config: AppConfig): void {
  if (!config.suiRegistryObjectId || !config.collateralCoinType || !config.principalCoinType) {
    throw new Error("Sui registry and coin types must be configured before signing");
  }
}
