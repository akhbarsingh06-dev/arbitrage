import type { Abi } from "viem";

export const executorAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export function getExecutorAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS;
  if (!addr) return null;
  if (!addr.startsWith("0x") || addr.length !== 42) return null;
  return addr as `0x${string}`;
}
