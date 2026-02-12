export function formatNumber(value: string | number, maxFractionDigits: number = 6): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function formatIntString(value: string): string {
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

export function formatPercent(value: number, maxFractionDigits: number = 2): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(maxFractionDigits)}%`;
}

export function shortHex(hex: string, head: number = 6, tail: number = 4): string {
  if (!hex || typeof hex !== "string") return "";
  if (!hex.startsWith("0x")) return hex;
  if (hex.length <= 2 + head + tail) return hex;
  return `${hex.slice(0, 2 + head)}…${hex.slice(-tail)}`;
}
