"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AnalyticsResponse } from "@/lib/types";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatIntString, formatNumber, shortHex } from "@/lib/format";

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/api/analytics"),
    refetchInterval: 15_000,
  });

  const successRatePct = data ? data.protocol.success.successRate * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Liquidity Efficiency Infrastructure on Base — protocol accounting + DEX liquidity overview (from free RPCs).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Total arbitrage volume"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalArbitrageVolumeUsd, 2)}` : isLoading ? "…" : "-"}
          helper="Approx USD (USDC direct; WETH via Uniswap on-chain quote)"
        />
        <Stat
          label="Total user profit"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalUserProfitUsd, 2)}` : isLoading ? "…" : "-"}
          helper="After 15% protocol fee"
        />
        <Stat
          label="Total protocol revenue"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalProtocolRevenueUsd, 2)}` : isLoading ? "…" : "-"}
          helper="Treasury performance fees"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Success rate"
          value={data ? `${formatNumber(successRatePct, 1)}%` : isLoading ? "…" : "-"}
          helper={`${data?.protocol.success.successes ?? 0}/${data?.protocol.success.attempts ?? 0} relayer attempts`}
        />
        <Stat
          label="Inefficiencies corrected"
          value={data ? data.protocol.success.inefficienciesCorrected : isLoading ? "…" : "-"}
          helper="Successful atomic arbitrages"
        />
        <Stat
          label="Fee (on-chain)"
          value={`${data?.protocol.feePercent ?? 15}%`}
          helper="Transparent performance fee"
        />
      </div>

      <Card>
        <CardHeader title="Accounting by asset" subtitle="Per-asset on-chain totals (no centralized price feeds)." />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Asset</Th>
                <Th>Volume</Th>
                <Th>User profit</Th>
                <Th>Protocol revenue</Th>
                <Th>Gas refunded</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.protocol.totalsByAsset ?? []).map((t) => (
                <tr key={t.asset}>
                  <Td>
                    <div className="font-medium">{t.symbol}</div>
                    <div className="mt-1 text-xs text-muted">{shortHex(t.asset)}</div>
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalVolume, 6)} {t.symbol}
                    {typeof t.totalVolumeUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalVolumeUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalUserProfit, 6)} {t.symbol}
                    {typeof t.totalUserProfitUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalUserProfitUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalProtocolRevenue, 6)} {t.symbol}
                    {typeof t.totalProtocolRevenueUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalProtocolRevenueUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">{formatNumber(t.totalGasRefunded, 6)} {t.symbol}</Td>
                </tr>
              ))}
              {!isLoading && (data?.protocol.totalsByAsset ?? []).length === 0 ? (
                <tr>
                  <Td className="text-muted" colSpan={5}>
                    No on-chain executions yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="DEX liquidity overview"
          subtitle="Monitored pools and current state (high-liquidity pools only; initial pairs only)."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill">Total pools: {data?.pools.dexOverview.totalPools ?? 0}</span>
              <span className="pill">Uni V3: {data?.pools.dexOverview.uniswapV3Pools ?? 0}</span>
              <span className="pill">Pancake V3: {data?.pools.dexOverview.pancakeV3Pools ?? 0}</span>
              <span className="pill">Aerodrome: {data?.pools.dexOverview.aerodromePools ?? 0}</span>
            </div>
          }
        />
        <div className="mt-4 space-y-6">
          {(data?.pools.pairs ?? []).map((p) => (
            <div key={p.pair} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">{p.pair}</div>
                <span className="pill">Pools: {p.prices.length}</span>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>DEX</Th>
                    <Th>Pool</Th>
                    <Th>Price</Th>
                    <Th>Liquidity / reserves</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.prices.map((pp) => (
                    <tr key={`${p.pair}-${pp.poolAddress}-${pp.dex}`}>
                      <Td>{pp.dex}</Td>
                      <Td className="text-muted">
                        <a className="underline decoration-white/20 hover:decoration-white/40" target="_blank" rel="noreferrer" href={`https://basescan.org/address/${pp.poolAddress}`}>
                          {shortHex(pp.poolAddress)}
                        </a>
                      </Td>
                      <Td className="text-muted">{formatNumber(pp.price, 8)}</Td>
                      <Td className="text-muted">
                        {(() => {
                          const state = (data?.pools.dexLiquidity ?? []).find((x) => x.address.toLowerCase() === pp.poolAddress.toLowerCase());
                          if (!state) return "-";
                          if (state.dex === "uniswapV3" && state.uniV3) {
                            return `liq ${formatIntString(state.uniV3.liquidity)} • fee ${state.uniV3.fee}`;
                          }
                          if (state.dex === "pancakeV3" && state.pancakeV3) {
                            return `liq ${formatIntString(state.pancakeV3.liquidity)} • fee ${state.pancakeV3.fee}`;
                          }
                          if (state.dex === "aerodrome" && state.aerodrome) {
                            return `${state.aerodrome.reserve0Human ?? "-"} ${state.token0.symbol} / ${state.aerodrome.reserve1Human ?? "-"} ${state.token1.symbol} • ${state.aerodrome.stable ? "stable" : "volatile"}`;
                          }
                          return "-";
                        })()}
                      </Td>
                    </tr>
                  ))}
                  {p.prices.length === 0 ? (
                    <tr>
                      <Td className="text-muted" colSpan={4}>
                        No pools for this pair.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
