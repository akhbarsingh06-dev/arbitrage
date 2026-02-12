import type { Hex } from "viem";

export type SwapStep = {
  adapter: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  data: Hex;
};

export type ExecutionIntent = {
  user: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  routeHash: Hex;
  minNetProfit: bigint;
  deadline: bigint;
  refundRecipient: `0x${string}`;
  maxGasRefund: bigint;
  nonce: bigint;
};

