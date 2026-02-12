import { encodeAbiParameters, keccak256, type Hex } from "viem";
import type { ExecutionIntent, SwapStep } from "./types";

export function computeRouteHash(steps: SwapStep[]): Hex {
  const encoded = encodeAbiParameters(
    [
      {
        name: "steps",
        type: "tuple[]",
        components: [
          { name: "adapter", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [
      steps.map((s) => ({
        adapter: s.adapter,
        tokenIn: s.tokenIn,
        tokenOut: s.tokenOut,
        amountIn: s.amountIn,
        minAmountOut: s.minAmountOut,
        data: s.data,
      })),
    ]
  );
  return keccak256(encoded);
}

export function buildIntentTypedData(params: {
  chainId: number;
  verifyingContract: `0x${string}`;
  intent: ExecutionIntent;
}) {
  return {
    domain: {
      name: "BaseArbExecutor",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      ExecutionIntent: [
        { name: "user", type: "address" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "routeHash", type: "bytes32" },
        { name: "minNetProfit", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "refundRecipient", type: "address" },
        { name: "maxGasRefund", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "ExecutionIntent" as const,
    message: params.intent,
  };
}

