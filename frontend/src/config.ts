import type { AppConfig } from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://testnet-api.nomadfinance.io";

export const FALLBACK_CONFIG: AppConfig = {
  apiVersion: "2026-07-25",
  suiNetwork: "testnet",
  suiRpcUrl: import.meta.env.VITE_SUI_RPC_URL ?? "https://sui-testnet-rpc.publicnode.com",
  suiPackageId: "0xd236e287e752dd9f1d05f9bd06c3bf44ef0c31d701d0a4b55b6ff2b9d7852c74",
  suiRegistryObjectId: import.meta.env.VITE_SUI_REGISTRY_OBJECT_ID ?? "",
  collateralCoinType:
    import.meta.env.VITE_COLLATERAL_COIN_TYPE ??
    import.meta.env.VITE_HBTC_COIN_TYPE ??
    "",
  principalCoinType:
    import.meta.env.VITE_PRINCIPAL_COIN_TYPE ??
    import.meta.env.VITE_DUSDC_COIN_TYPE ??
    "",
};

export const CLOCK_OBJECT_ID = "0x6";
export const PRINCIPAL_DECIMALS = Number(import.meta.env.VITE_PRINCIPAL_DECIMALS ?? "6");
export const COLLATERAL_DECIMALS = Number(import.meta.env.VITE_COLLATERAL_DECIMALS ?? "8");
export const PRINCIPAL_SYMBOL = import.meta.env.VITE_PRINCIPAL_SYMBOL ?? "USDC";
export const COLLATERAL_SYMBOL = import.meta.env.VITE_COLLATERAL_SYMBOL ?? "hBTC";
