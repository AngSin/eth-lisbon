import { API_BASE_URL, FALLBACK_CONFIG } from "./config";
import type { AppConfig, Loan, LoanOffer, MarketPrice } from "./types";

export async function fetchConfig(): Promise<AppConfig> {
  try {
    return await request<AppConfig>("/config");
  } catch {
    return FALLBACK_CONFIG;
  }
}

export async function fetchOffers(): Promise<LoanOffer[]> {
  const body = await request<{ offers: LoanOffer[] }>("/offers");
  return body.offers;
}

export async function fetchAccountLoans(address: string): Promise<Loan[]> {
  const body = await request<{ loans: Loan[] }>(`/accounts/${encodeURIComponent(address)}/loans`);
  return body.loans;
}

export async function fetchLoan(loanId: string): Promise<Loan | null> {
  const response = await fetch(`${API_BASE_URL}/loans/${encodeURIComponent(loanId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  const body = (await response.json()) as { loan: Loan };
  return body.loan;
}

export async function fetchBtcUsdcPrice(): Promise<MarketPrice> {
  return request<MarketPrice>("/market/btc-usdc");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return (await response.json()) as T;
}
