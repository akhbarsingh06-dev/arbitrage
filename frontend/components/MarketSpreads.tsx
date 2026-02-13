"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { SpreadsResponse, PairsResponse } from "@/lib/types";
import { Card, CardHeader, Table, Td, Th } from "./ui";

export function MarketSpreads() {
    const [search, setSearch] = useState("");
    const [selectedPair, setSelectedPair] = useState<string | null>(null);

    const { data: pairsData } = useQuery({
        queryKey: ["pairs"],
        queryFn: () => apiGet<PairsResponse>("/api/pairs"),
        refetchInterval: 30_000,
    });

    const { data: spreadsData } = useQuery({
        queryKey: ["spreads"],
        queryFn: () => apiGet<SpreadsResponse>("/api/spreads"),
        refetchInterval: 5_000,
    });

    const filteredPairs = useMemo(() => {
        if (!pairsData) return [];
        return pairsData.pairs.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [pairsData, search]);

    const activeSpreads = useMemo(() => {
        if (!spreadsData) return [];
        return spreadsData.pairs.filter(p => !selectedPair || p.pair === selectedPair);
    }, [spreadsData, selectedPair]);

    return (
        <Card>
            <CardHeader
                title="Market pricing spreads"
                subtitle="Real-time inefficiency detection across Uniswap V3, Pancake V3, and Aerodrome."
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        placeholder="Search pair (e.g. BRETT/WETH)..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && !selectedPair && (
                        <div className="absolute z-10 w-full mt-1 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl max-h-48 overflow-y-auto">
                            {filteredPairs.map(p => (
                                <div
                                    key={p.name}
                                    className="px-3 py-2 hover:bg-[#2a2e39] cursor-pointer text-sm flex justify-between items-center"
                                    onClick={() => {
                                        setSelectedPair(p.name);
                                        setSearch(p.name);
                                    }}
                                >
                                    <span>{p.name}</span>
                                    <span className="text-[10px] uppercase opacity-50">{p.source}</span>
                                </div>
                            ))}
                            {filteredPairs.length === 0 && <div className="px-3 py-2 text-muted text-xs">No pairs found</div>}
                        </div>
                    )}
                </div>

                {selectedPair && (
                    <button
                        onClick={() => { setSelectedPair(null); setSearch(""); }}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                        Clear filter
                    </button>
                )}

                <div className="text-xs text-muted ml-auto">
                    {pairsData?.pairs.length ?? 0} pairs monitored
                </div>
            </div>

            <div className="mt-4 overflow-x-auto">
                <Table>
                    <thead>
                        <tr>
                            <Th>Pair</Th>
                            <Th>Best Route</Th>
                            <Th>Spread (Net)</Th>
                            <Th>Pool Count</Th>
                            <Th>Status</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeSpreads.slice(0, 10).map((p) => {
                            const best = p.topRaw[0];
                            const isProfitable = best && best.netSpreadPercent > 0;

                            return (
                                <tr key={p.pair} className={selectedPair === p.pair ? "bg-[rgba(79,70,229,0.1)]" : ""}>
                                    <Td className="font-medium">{p.pair}</Td>
                                    <Td className="text-muted">
                                        {best ? `${best.buyDex} → ${best.sellDex}` : "N/A"}
                                    </Td>
                                    <Td>
                                        {best ? (
                                            <span className={isProfitable ? "text-[#4caf50]" : "text-muted"}>
                                                {best.netSpreadPercent.toFixed(2)}%
                                            </span>
                                        ) : "N/A"}
                                    </Td>
                                    <Td>{p.pools.length}</Td>
                                    <Td>
                                        {isProfitable ? (
                                            <span className="text-[10px] bg-[rgba(76,175,80,0.1)] text-[#4caf50] px-1.5 py-0.5 rounded border border-[rgba(76,175,80,0.2)]">
                                                OPPORTUNITY
                                            </span>
                                        ) : (
                                            <span className="text-[10px] bg-[rgba(255,255,255,0.05)] text-muted px-1.5 py-0.5 rounded">
                                                MONITORING
                                            </span>
                                        )}
                                    </Td>
                                </tr>
                            );
                        })}
                        {activeSpreads.length === 0 && (
                            <tr>
                                <Td colSpan={5} className="text-center text-muted py-8">
                                    No pairs matching filters.
                                </Td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </div>
        </Card>
    );
}
