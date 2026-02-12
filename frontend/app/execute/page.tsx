"use client";

import { useMemo, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "wagmi/actions";
import { encodeAbiParameters, formatUnits, keccak256, parseEther, parseUnits, type Hex } from "viem";
import { wagmiConfig } from "@/lib/wagmi";
import { apiGet, apiPost } from "@/lib/http";
import { executorAbi, getExecutorAddress } from "@/lib/contracts";
import type {
  AnalyticsResponse,
  ExecutionIntent,
  ExecutionResult,
  HealthResponse,
  OpportunityResponse,
  SpreadsResponse,
  SimulationResult,
  SwapStep,
} from "@/lib/types";
import { decimalsForToken } from "@/lib/tokens";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatNumber, formatPercent, shortHex } from "@/lib/format";

function toBigIntString(value: string | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function normalizeSteps(sim: SimulationResult): SwapStep[] {
  return sim.route.steps.map((s) => ({
    adapter: s.adapter as Hex,
    tokenIn: s.tokenIn as Hex,
    tokenOut: s.tokenOut as Hex,
    amountIn: BigInt(s.amountIn),
    minAmountOut: BigInt(s.minAmountOut),
    data: s.data as Hex,
  }));
}

function computeRouteHash(steps: SwapStep[]): Hex {
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
        amountIn: toBigIntString(s.amountIn),
        minAmountOut: toBigIntString(s.minAmountOut),
        data: s.data as Hex,
      })),
    ]
  );
  return keccak256(encoded);
}

function computeEconomics(sim: SimulationResult, asset: Hex, refundEnabled: boolean) {
  const decimals = decimalsForToken(asset) ?? 18;
  const grossProfitRaw = BigInt(sim.grossProfitRaw);

  // Gas estimate denominated in the borrowed/profit token (USDC or WETH initial pairs).
  const gasTokenEstimate = decimals === 6 ? parseUnits(sim.gasCostUsd || "0", 6) : parseEther(sim.gasCostEth || "0");

  // Refund at most 40% of estimated user profit, and target 110% of gas estimate.
  // Contract caps actual refund at `maxGasRefund`, and reverts if user profit < minNetProfit.
  const estimatedUserProfitAfterFee = BigInt(sim.userProfitRaw);
  const refundCap = (estimatedUserProfitAfterFee * 40n) / 100n;
  const desiredRefund = (gasTokenEstimate * 110n) / 100n;
  const maxGasRefund = refundEnabled ? (desiredRefund > refundCap ? refundCap : desiredRefund) : 0n;

  const grossAfterRefund = grossProfitRaw > maxGasRefund ? grossProfitRaw - maxGasRefund : 0n;
  const userAfterRefund = (grossAfterRefund * 8500n) / 10000n;
  const feeAfterRefund = grossAfterRefund - userAfterRefund;
  const minNetProfit = (userAfterRefund * 95n) / 100n; // safety buffer vs reorg/price movement

  return { decimals, gasTokenEstimate, maxGasRefund, userAfterRefund, feeAfterRefund, minNetProfit };
}

function computeSuccessProbability(sim: SimulationResult, userAfterRefund: bigint, gasTokenEstimate: bigint): number {
  const ageSec = Math.max(0, (Date.now() - sim.timestamp) / 1000);
  let p = 0.82;

  if (sim.spreadPercent >= 0.5) p += 0.06;
  else if (sim.spreadPercent >= 0.2) p += 0.03;
  else if (sim.spreadPercent <= 0.12) p -= 0.04;

  if (ageSec > 60) p -= 0.35;
  else if (ageSec > 30) p -= 0.18;
  else if (ageSec > 10) p -= 0.08;

  const ratioTimes100 = gasTokenEstimate > 0n ? (userAfterRefund * 100n) / gasTokenEstimate : 0n;
  const ratio = Number(ratioTimes100) / 100;
  if (ratio >= 5) p += 0.14;
  else if (ratio >= 2) p += 0.10;
  else if (ratio >= 1) p += 0.05;
  else p -= 0.10;

  p = Math.max(0.05, Math.min(0.95, p));
  return Math.round(p * 1000) / 10; // 0.1% precision
}

export default function ExecutePage() {
  const { address } = useAccount();
  const executorAddress = getExecutorAddress();
  const { signTypedDataAsync, isPending: signPending } = useSignTypedData();

  const [selected, setSelected] = useState<SimulationResult | null>(null);
  const [submitResult, setSubmitResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 10_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/api/analytics"),
    refetchInterval: 15_000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<OpportunityResponse>("/api/opportunities"),
    refetchInterval: 5_000,
  });

  const { data: spreadsData } = useQuery({
    queryKey: ["spreads"],
    queryFn: () => apiGet<SpreadsResponse>("/api/spreads"),
    refetchInterval: 10_000,
  });

  const rows = useMemo(() => data?.opportunities ?? [], [data]);
  const relayerAddress = (analytics?.relayer?.address ?? "0x0000000000000000000000000000000000000000") as Hex;
  const refundEnabled = relayerAddress !== "0x0000000000000000000000000000000000000000";

  async function onExecute(sim: SimulationResult) {
    setError(null);
    setSubmitResult(null);

    if (!address) {
      setError("Connect your wallet to sign an execution intent.");
      return;
    }
    if (!sim.executionReady) {
      const missing = (sim.missingAdapters ?? []).join(", ");
      setError(`This route is not executable on the backend (missing adapters: ${missing || "unknown"}).`);
      return;
    }
    if (!executorAddress) {
      setError("Missing NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS.");
      return;
    }
    if (health?.executionConfigured === false) {
      setError(`Execution disabled on backend (missing env: ${(health?.missingEnv ?? []).join(", ")}).`);
      return;
    }

    const steps = normalizeSteps(sim);
    const asset = sim.route.flashLoanToken as Hex;
    const amount = BigInt(sim.route.flashLoanAmount);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const { maxGasRefund, minNetProfit } = computeEconomics(sim, asset, refundEnabled);

    const routeHash = computeRouteHash(steps);
    const nonce = await readContract(wagmiConfig, {
      address: executorAddress,
      abi: executorAbi,
      functionName: "nonces",
      args: [address],
    });

    const intent: ExecutionIntent = {
      user: address,
      asset,
      amount,
      routeHash,
      minNetProfit,
      deadline,
      refundRecipient: refundEnabled ? relayerAddress : ("0x0000000000000000000000000000000000000000" as Hex),
      maxGasRefund: refundEnabled ? maxGasRefund : 0n,
      nonce,
    };

    const signature = await signTypedDataAsync({
      domain: { name: "BaseArbExecutor", version: "1", chainId: 8453, verifyingContract: executorAddress },
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
      primaryType: "ExecutionIntent",
      message: {
        user: intent.user,
        asset: intent.asset,
        amount: intent.amount,
        routeHash: intent.routeHash,
        minNetProfit: intent.minNetProfit,
        deadline: intent.deadline,
        refundRecipient: intent.refundRecipient,
        maxGasRefund: intent.maxGasRefund,
        nonce: intent.nonce,
      },
    });

    const result = await apiPost<ExecutionResult>("/api/intent/submit", {
      intent: {
        ...intent,
        amount: intent.amount.toString(),
        minNetProfit: intent.minNetProfit.toString(),
        deadline: intent.deadline.toString(),
        maxGasRefund: intent.maxGasRefund.toString(),
        nonce: intent.nonce.toString(),
      },
      steps: steps.map((s) => ({ ...s, amountIn: s.amountIn.toString(), minAmountOut: s.minAmountOut.toString() })),
      signature,
    });

    setSubmitResult(result);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Execute arbitrage</h1>
          <p className="mt-1 text-sm text-muted">
            Scanner finds opportunities; you sign an intent; relayer submits; contract reverts unless net user profit &gt; 0.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">Relayer pays gas</span>
          <button className="btn" onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Card className="border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]">
          <CardHeader title="Action required" subtitle={error} />
        </Card>
      ) : null}

      {submitResult ? (
        <Card className={submitResult.success ? "border-[rgba(110,231,255,0.35)] bg-[rgba(110,231,255,0.06)]" : "border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]"}>
          <CardHeader
            title={submitResult.success ? "Submitted" : "Failed"}
            subtitle={
              submitResult.txHash
                ? `Tx: ${submitResult.txHash}`
                : submitResult.error
                  ? submitResult.error
                  : "Unknown result"
            }
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Wallet" value={address ? shortHex(address) : "Not connected"} helper="Used only to sign intent" />
        <Stat label="Executor" value={executorAddress ? shortHex(executorAddress) : "Missing env"} helper="verifyingContract for EIP-712" />
        <Stat label="Fee" value={`${analytics?.protocol.feePercent ?? 15}%`} helper="Charged on-chain on realized profit" />
      </div>

      <Card>
        <CardHeader title="Opportunities" subtitle="Live feed from backend scanner (polling)." right={<span className="pill">Count: {rows.length}</span>} />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Pair</Th>
                <Th>Route</Th>
                <Th>Gross</Th>
                <Th>Fee (15%)</Th>
                <Th>Gas (est.)</Th>
                <Th>Net user</Th>
                <Th>Success</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const assetAddr = o.route.flashLoanToken as Hex;
                const { decimals, gasTokenEstimate, userAfterRefund, feeAfterRefund } = computeEconomics(o, assetAddr, refundEnabled);
                const success = computeSuccessProbability(o, userAfterRefund, gasTokenEstimate);

                return (
                  <tr key={o.id}>
                    <Td>{o.pair}</Td>
                    <Td className="text-muted">
                      {o.buyDex} → {o.sellDex}
                    </Td>
                    <Td>
                      {formatNumber(o.grossProfit, 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">
                      {formatNumber(formatUnits(feeAfterRefund, decimals), 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">{o.inputToken === "USDC" ? `$${o.gasCostUsd}` : `${o.gasCostEth} ETH`}</Td>
                    <Td>
                      {formatNumber(formatUnits(userAfterRefund, decimals), 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">{formatPercent(success, 1)}</Td>
                    <Td className="text-right">
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSelected(o);
                          onExecute(o).catch((e) => setError(e.message));
                        }}
                        disabled={signPending || health?.executionConfigured === false || !o.netProfitable || !o.executionReady}
                      >
                        {!o.netProfitable
                          ? "Not profitable"
                          : !o.executionReady
                            ? "Missing adapter"
                            : signPending && selected?.id === o.id
                              ? "Signing…"
                              : "Execute"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <Td className="text-muted" colSpan={8}>
                    No profitable opportunities right now.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardHeader
            title="Market spreads"
            subtitle="If this table shows tiny spreads, the market is efficient and profitable arbs will be rare."
          />
          <div className="mt-4 space-y-2 text-sm">
            {(spreadsData?.pairs ?? []).map((p) => {
              const topNet = [...(p.spreads ?? [])].sort((a, b) => b.spreadPercent - a.spreadPercent)[0];
              const topRaw = [...(p.topRaw ?? [])].sort((a, b) => b.rawSpreadPercent - a.rawSpreadPercent)[0];
              return (
                <div key={p.pair} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <div className="font-medium">{p.pair}</div>
                  <div className="text-muted">
                    {topRaw
                      ? `Top raw: ${formatNumber(topRaw.rawSpreadPercent, 4)}% • fees: ${formatNumber(topRaw.feePercent, 2)}% • net: ${formatNumber(topRaw.netSpreadPercent, 4)}% (${topRaw.buyDex} → ${topRaw.sellDex})`
                      : topNet
                        ? `Top net: ${formatNumber(topNet.spreadPercent, 4)}% (${topNet.buyPool.dex} → ${topNet.sellPool.dex})`
                        : "n/a"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Selected"
          subtitle={selected ? "Execution intent is computed from selected route." : "Select an opportunity to preview intent parameters."}
          right={
            selected ? (
              <button
                className="btn btn-primary"
                onClick={() => onExecute(selected).catch((e) => setError(e.message))}
                disabled={signPending || !selected.executionReady}
              >
                {signPending ? "Signing…" : "Sign & submit"}
              </button>
            ) : null
          }
        />

        <div className="mt-4">
          {selected ? (
            (() => {
              const asset = selected.route.flashLoanToken as Hex;
              const { decimals, maxGasRefund, userAfterRefund, feeAfterRefund, minNetProfit } = computeEconomics(selected, asset, refundEnabled);

              return (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Stat label="Pair" value={selected.pair} helper={`${selected.buyDex} → ${selected.sellDex}`} />
                  <Stat label="Borrowed asset" value={shortHex(asset)} helper={`Amount: ${selected.route.flashLoanAmount}`} />
                  <Stat label="Gross profit" value={`${formatNumber(selected.grossProfit, 6)} ${selected.inputToken}`} helper="After flash premium, before refunds/fees" />
                  <Stat label="Protocol fee (15%)" value={`${formatNumber(formatUnits(feeAfterRefund, decimals), 6)} ${selected.inputToken}`} helper="Charged on-chain after refund" />
                  <Stat label="Gas refund cap" value={`${formatNumber(formatUnits(maxGasRefund, decimals), 6)} ${selected.inputToken}`} helper={refundEnabled ? "Paid to relayer from profits" : "Refund disabled"} />
                  <Stat label="Net user profit (est.)" value={`${formatNumber(formatUnits(userAfterRefund, decimals), 6)} ${selected.inputToken}`} helper={`Min user profit (signed): ${formatNumber(formatUnits(minNetProfit, decimals), 6)} ${selected.inputToken}`} />
                </div>
              );
            })()
          ) : (
            <div className="text-sm text-muted">No selection.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
