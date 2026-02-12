"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AnalyticsResponse, HealthResponse, OpportunityResponse, SimulationResult } from "@/lib/types";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatNumber, shortHex } from "@/lib/format";

function TopOpportunities({ opportunities }: { opportunities: SimulationResult[] }) {
  return (
    <Card>
      <CardHeader
        title="Top opportunities"
        subtitle="Best net-profitable simulations from the scanner."
        right={
          <Link className="btn btn-primary" href="/execute">
            Execute arbitrage
          </Link>
        }
      />

      <div className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Pair</Th>
              <Th>Route</Th>
              <Th>Gross profit</Th>
              <Th>Gas (est.)</Th>
              <Th>Spread</Th>
            </tr>
          </thead>
          <tbody>
            {opportunities.slice(0, 8).map((o) => (
              <tr key={o.id}>
                <Td>{o.pair}</Td>
                <Td className="text-muted">
                  {o.buyDex} → {o.sellDex}
                </Td>
                <Td>
                  {formatNumber(o.grossProfit, 6)} {o.inputToken}
                </Td>
                <Td className="text-muted">{o.inputToken === "USDC" ? `$${o.gasCostUsd}` : `${o.gasCostEth} ETH`}</Td>
                <Td className="text-muted">{o.spreadPercent.toFixed(4)}%</Td>
              </tr>
            ))}
            {opportunities.length === 0 ? (
              <tr>
                <Td className="text-muted" colSpan={5}>
                  No opportunities right now.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { address } = useAccount();

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

  const { data: opportunities } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<OpportunityResponse>("/api/opportunities"),
    refetchInterval: 5_000,
  });

  const opps = useMemo(() => opportunities?.opportunities ?? [], [opportunities]);
  const executionConfigured = health?.executionConfigured ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Liquidity Efficiency Infrastructure on Base</h1>
          <p className="mt-1 text-sm text-muted">
            Public arbitrage execution rails that compress DEX pricing inefficiencies and charge a transparent 15% on-chain performance fee.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">Wallet: {address ? shortHex(address) : "Not connected"}</span>
          <span className="pill">
            Execution:{" "}
            {executionConfigured ? (
              <span className="text-slate-100">Enabled</span>
            ) : (
              <span className="text-[rgba(255,107,107,0.95)]">Disabled</span>
            )}
          </span>
        </div>
      </div>

      {!executionConfigured && (health?.missingEnv?.length ?? 0) > 0 ? (
        <Card className="border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]">
          <CardHeader
            title="Execution disabled"
            subtitle={`Backend is missing env: ${health?.missingEnv.join(", ")}`}
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Active opportunities" value={health?.activeOpportunities ?? opps.length} helper="From /api/opportunities" />
        <Stat label="Pools monitored" value={health?.poolsMonitored ?? analytics?.pools.monitored ?? "-"} helper="High-liquidity pools only" />
        <Stat label="Protocol fee" value={`${analytics?.protocol.feePercent ?? 15}%`} helper="On-chain performance fee" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Total executions" value={analytics?.protocol.totalExecutions ?? "-"} />
        <Stat
          label="Total user profit"
          value={analytics ? `$${formatNumber(analytics.protocol.totalsUsd.totalUserProfitUsd, 2)}` : "-"}
          helper="Approx USD (from on-chain quotes)"
        />
        <Stat
          label="Total protocol revenue"
          value={analytics ? `$${formatNumber(analytics.protocol.totalsUsd.totalProtocolRevenueUsd, 2)}` : "-"}
          helper="Treasury performance fees"
        />
      </div>

      <TopOpportunities opportunities={opps} />
    </div>
  );
}
