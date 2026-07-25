import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { AppConfig } from "./config.js";

export type WebhookSecrets = Record<string, string>;

export async function loadWebhookSecrets(
  config: AppConfig,
): Promise<WebhookSecrets> {
  if (config.webhookSecretsJson) {
    return parseSecretMap(config.webhookSecretsJson);
  }
  if (config.webhookSecret) {
    return { default: config.webhookSecret };
  }
  if (config.webhookSecretsSecretName) {
    const client = new SecretsManagerClient({});
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: config.webhookSecretsSecretName }),
    );
    if (!result.SecretString) throw new Error("webhook secret has no SecretString");
    return parseSecretMap(result.SecretString);
  }
  if (config.webhookSecretsParameterName) {
    const client = new SSMClient({});
    const result = await client.send(
      new GetParameterCommand({
        Name: config.webhookSecretsParameterName,
        WithDecryption: true,
      }),
    );
    const value = result.Parameter?.Value;
    if (!value) throw new Error("webhook parameter has no value");
    return parseSecretMap(value);
  }
  throw new Error("no Inodra webhook secret configured");
}

function parseSecretMap(value: string): WebhookSecrets {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return { default: trimmed };
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("webhook secrets JSON must be an object");
  }
  const map: WebhookSecrets = {};
  for (const [key, secret] of Object.entries(parsed)) {
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error(`invalid webhook secret for ${key}`);
    }
    map[key] = secret;
  }
  return map;
}
