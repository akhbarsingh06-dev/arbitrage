"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { ExecutionResult } from "@/lib/types";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { formatNumber, shortHex } from "@/lib/format";

export default function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiGet<{ history: ExecutionResult[] }>("/api/history"),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transaction history</h1>
        <p className="mt-1 text-sm text-muted">Relayer-submitted executions (intent or direct).</p>
      </div>

      <Card>
        <CardHeader title="Recent transactions" subtitle="Pulled from backend memory (no paid infra)." />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Status</Th>
                <Th>Tx</Th>
                <Th>Gas</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).map((h) => (
                <tr key={`${h.simulationId}-${h.timestamp}`}>
                  <Td className="text-muted">{new Date(h.timestamp).toLocaleString()}</Td>
                  <Td>{h.success ? <span className="pill">Success</span> : <span className="pill">Failed</span>}</Td>
                  <Td className="text-muted">
                    {h.txHash ? (
                      <a className="underline decoration-white/20 hover:decoration-white/40" target="_blank" rel="noreferrer" href={`https://basescan.org/tx/${h.txHash}`}>
                        {shortHex(h.txHash)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="text-muted">{h.gasUsed ? formatNumber(h.gasUsed, 0) : "-"}</Td>
                  <Td className="text-muted">{h.error ?? "-"}</Td>
                </tr>
              ))}
              {!isLoading && (data?.history ?? []).length === 0 ? (
                <tr>
                  <Td className="text-muted" colSpan={5}>
                    No executions yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
