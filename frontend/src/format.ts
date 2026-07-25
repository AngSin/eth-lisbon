export function parseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) throw new Error("Enter a non-negative amount");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimals`);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export function formatUnits(value: string | bigint, decimals: number, symbol: string): string {
  const amount = typeof value === "bigint" ? value : BigInt(value || "0");
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = amount % scale;
  if (fraction === 0n) return `${whole.toString()} ${symbol}`;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionText.slice(0, 4)} ${symbol}`;
}

export function formatBps(value?: number): string {
  if (value === undefined) return "n/a";
  const whole = Math.trunc(value / 100);
  const fraction = Math.abs(value % 100).toString().padStart(2, "0");
  return `${whole}.${fraction}%`;
}

export function shortAddress(address: string): string {
  if (!address) return "n/a";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDuration(ms: number): string {
  const days = Math.max(1, Math.trunc(ms / 86_400_000));
  return `${days}d`;
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
