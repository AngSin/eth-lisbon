import type { App } from "aws-cdk-lib";

export interface DeploymentConfig {
  hostedZoneId: string;
  hostedZoneName: string;
  landingDomainName: string;
  landingAssetsBucketName: string;
  landingDistributionId: string;
  landingDistributionDomainName: string;
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
  if (normalizedDomain === normalizedZone) {
    return "";
  }
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
    landingDomainName: read("landingDomainName", "nomadfinance.io"),
    landingAssetsBucketName: read("landingAssetsBucketName", "nomadwebstack-assets9a31d427-nlv64ucstuo8"),
    landingDistributionId: read("landingDistributionId", "E2L1EXRMK29M1Y"),
    landingDistributionDomainName: read("landingDistributionDomainName", "d3mo6ecn37gtye.cloudfront.net"),
    frontendDomainName: read("frontendDomainName", "testnet.nomadfinance.io"),
    apiDomainName: read("apiDomainName", "testnet-api.nomadfinance.io"),
    suiNetwork: read("suiNetwork", "testnet"),
    suiRpcUrl: read("suiRpcUrl", "https://fullnode.testnet.sui.io:443"),
    suiPackageId: read(
      "suiPackageId",
      "0xd236e287e752dd9f1d05f9bd06c3bf44ef0c31d701d0a4b55b6ff2b9d7852c74",
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
