import type { Hex } from "viem";

export const ADDR = {
  USDC: (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "") as Hex,
  WETH: (process.env.NEXT_PUBLIC_WETH_ADDRESS ?? "") as Hex,
  CBETH: (process.env.NEXT_PUBLIC_CBETH_ADDRESS ?? "") as Hex,
  DAI: (process.env.NEXT_PUBLIC_DAI_ADDRESS ?? "") as Hex,
  USDBC: (process.env.NEXT_PUBLIC_USDBC_ADDRESS ?? "") as Hex,
  CBBTC: (process.env.NEXT_PUBLIC_CBBTC_ADDRESS ?? "") as Hex,
} as const;

export function decimalsForToken(token: string): number | null {
  const t = token.toLowerCase();
  if (ADDR.USDC && t === ADDR.USDC.toLowerCase()) return 6;
  if (ADDR.WETH && t === ADDR.WETH.toLowerCase()) return 18;
  if (ADDR.CBETH && t === ADDR.CBETH.toLowerCase()) return 18;
  if (ADDR.DAI && t === ADDR.DAI.toLowerCase()) return 18;
  if (ADDR.USDBC && t === ADDR.USDBC.toLowerCase()) return 6;
  if (ADDR.CBBTC && t === ADDR.CBBTC.toLowerCase()) return 8;
  return null;
}
