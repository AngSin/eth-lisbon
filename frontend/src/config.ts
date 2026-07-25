import type { AppConfig } from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://testnet-api.nomadfinance.io";

export const FALLBACK_CONFIG: AppConfig = {
  apiVersion: "2026-07-25",
  suiNetwork: "testnet",
  suiRpcUrl: "https://fullnode.testnet.sui.io:443",
  suiPackageId: "0x86f4bd9977438c3da6060e3b17b0966efacd3e3c18b977f736933dcdb9c07142",
  suiRegistryObjectId: import.meta.env.VITE_SUI_REGISTRY_OBJECT_ID ?? "",
  hbtcCoinType: import.meta.env.VITE_HBTC_COIN_TYPE ?? "",
  dusdcCoinType: import.meta.env.VITE_DUSDC_COIN_TYPE ?? "",
};

export const CLOCK_OBJECT_ID = "0x6";
export const DUSDC_DECIMALS = 6;
export const HBTC_DECIMALS = 8;
