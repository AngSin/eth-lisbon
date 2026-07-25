export interface AppConfig {
  apiVersion: string;
  suiNetwork: string;
  suiRpcUrl: string;
  suiPackageId: string;
  suiRegistryObjectId: string;
  hbtcCoinType: string;
  dusdcCoinType: string;
  loanOffersTable: string;
  loansTable: string;
  webhookReceiptsTable: string;
  webhookTimestampToleranceSeconds: number;
  webhookSecretsJson?: string;
  webhookSecret?: string;
  webhookSecretsSecretName?: string;
  webhookSecretsParameterName?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    apiVersion: env.API_VERSION ?? "2026-07-25",
    suiNetwork: env.SUI_NETWORK ?? "testnet",
    suiRpcUrl: env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
    suiPackageId:
      env.SUI_PACKAGE_ID ??
      "0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142",
    suiRegistryObjectId: env.SUI_REGISTRY_OBJECT_ID ?? "",
    hbtcCoinType: env.HBTC_COIN_TYPE ?? "",
    dusdcCoinType: env.DUSDC_COIN_TYPE ?? "",
    loanOffersTable: env.LOAN_OFFERS_TABLE ?? "LoanOffers",
    loansTable: env.LOANS_TABLE ?? "Loans",
    webhookReceiptsTable: env.WEBHOOK_RECEIPTS_TABLE ?? "WebhookReceipts",
    webhookTimestampToleranceSeconds: Number(
      env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? "300",
    ),
    webhookSecretsJson: env.INODRA_WEBHOOK_SECRETS_JSON,
    webhookSecret: env.INODRA_WEBHOOK_SECRET,
    webhookSecretsSecretName: env.INODRA_WEBHOOK_SECRETS_SECRET_NAME,
    webhookSecretsParameterName: env.INODRA_WEBHOOK_SECRETS_PARAMETER_NAME,
  };
}
