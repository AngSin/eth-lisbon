import type { AppConfig } from "./config.js";

export interface MarketPrice {
  source: "livecoinwatch";
  base: "BTC";
  quote: "USDC";
  rate: string;
  updatedAt: string;
}

interface LiveCoinWatchSingleResponse {
  rate?: unknown;
}

export async function fetchBtcUsdcPrice(config: AppConfig): Promise<MarketPrice> {
  if (!config.liveCoinWatchApiKey) {
    throw new Error("LIVECOINWATCH_API_KEY is not configured");
  }

  const response = await fetch("https://api.livecoinwatch.com/coins/single", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.liveCoinWatchApiKey,
    },
    body: JSON.stringify({
      currency: "USDC",
      code: "BTC",
      meta: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`LiveCoinWatch API ${response.status}`);
  }

  const body = (await response.json()) as LiveCoinWatchSingleResponse;
  if (typeof body.rate !== "number" || !Number.isFinite(body.rate) || body.rate <= 0) {
    throw new Error("LiveCoinWatch response is missing BTC/USDC rate");
  }

  return {
    source: "livecoinwatch",
    base: "BTC",
    quote: "USDC",
    rate: body.rate.toFixed(6),
    updatedAt: new Date().toISOString(),
  };
}
