import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import { DynamoRepository } from "../db.js";
import { json } from "../http.js";
import { loadWebhookSecrets } from "../secrets.js";
import { handleInodraWebhook } from "../webhook.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const config = loadConfig();
  const repository = new DynamoRepository(config);
  try {
    const secrets = await loadWebhookSecrets(config);
    return await handleInodraWebhook(event, config, repository, secrets);
  } catch (error) {
    console.error("webhook processing failed", error);
    return json(500, { error: "webhook processing failed" });
  }
}
