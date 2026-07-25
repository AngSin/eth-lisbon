import type { App } from "aws-cdk-lib";

export interface DeploymentConfig {
  hostedZoneId: string;
  hostedZoneName: string;
  frontendDomainName: string;
  apiDomainName: string;
  suiNetwork: string;
  suiRpcUrl: string;
  suiPackageId: string;
  suiRegistryObjectId: string;
  collateralCoinType: string;
  principalCoinType: string;
  inodraWebhookSecretsSecretName?: string;
  inodraWebhookSecretsParameterName?: string;
}

export function recordNameForZone(domainName: string, hostedZoneName: string): string {
  const normalizedDomain = domainName.replace(/\.$/, "");
  const normalizedZone = hostedZoneName.replace(/\.$/, "");
  const suffix = `.${normalizedZone}`;
  return normalizedDomain.endsWith(suffix)
    ? normalizedDomain.slice(0, -suffix.length)
    : normalizedDomain;
}

export function loadDeploymentConfig(app: App): DeploymentConfig {
  const read = (name: string, fallback = "") =>
    stringValue(app.node.tryGetContext(name) ?? process.env[envName(name)] ?? fallback);

  return {
    hostedZoneId: read("hostedZoneId", "Z091724633RFYDHQ5WNFL"),
    hostedZoneName: read("hostedZoneName", "nomadfinance.io"),
    frontendDomainName: read("frontendDomainName", "testnet.nomadfinance.io"),
    apiDomainName: read("apiDomainName", "testnet-api.nomadfinance.io"),
    suiNetwork: read("suiNetwork", "testnet"),
    suiRpcUrl: read("suiRpcUrl", "https://fullnode.testnet.sui.io:443"),
    suiPackageId: read(
      "suiPackageId",
      "0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142",
    ),
    suiRegistryObjectId: read("suiRegistryObjectId"),
    collateralCoinType: read("collateralCoinType", read("hbtcCoinType")),
    principalCoinType: read("principalCoinType", read("dusdcCoinType")),
    inodraWebhookSecretsSecretName: optional(read("inodraWebhookSecretsSecretName")),
    inodraWebhookSecretsParameterName: optional(read("inodraWebhookSecretsParameterName")),
  };
}

function envName(contextName: string): string {
  return contextName.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optional(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}
