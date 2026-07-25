export interface AppConfig {
  apiVersion: string;
  suiNetwork: string;
  suiRpcUrl: string;
  suiPackageId: string;
  suiEventPackageId?: string;
  suiRegistryObjectId: string;
  collateralCoinType: string;
  principalCoinType: string;
  loanOffersTable: string;
  loansTable: string;
  webhookReceiptsTable: string;
  webhookTimestampToleranceSeconds: number;
  webhookSecretsJson?: string;
  webhookSecret?: string;
  webhookSecretsSecretName?: string;
  webhookSecretsParameterName?: string;
  liveCoinWatchApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    apiVersion: env.API_VERSION ?? "2026-07-25",
    suiNetwork: env.SUI_NETWORK ?? "testnet",
    suiRpcUrl: env.SUI_RPC_URL ?? "https://sui-testnet-rpc.publicnode.com",
    suiPackageId:
      env.SUI_PACKAGE_ID ??
      "0xd236e287e752dd9f1d05f9bd06c3bf44ef0c31d701d0a4b55b6ff2b9d7852c74",
    suiEventPackageId: env.SUI_EVENT_PACKAGE_ID,
    suiRegistryObjectId: env.SUI_REGISTRY_OBJECT_ID ?? "",
    collateralCoinType:
      env.COLLATERAL_COIN_TYPE ?? env.HBTC_COIN_TYPE ?? "",
    principalCoinType:
      env.PRINCIPAL_COIN_TYPE ?? env.DUSDC_COIN_TYPE ?? "",
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
    liveCoinWatchApiKey: env.LIVECOINWATCH_API_KEY,
  };
}
