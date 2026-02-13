import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ethers } from "ethers";
import { config } from "./config";
import { PoolMonitor, PriceUpdate } from "./poolMonitor";
import { PriceCalculator } from "./priceCalculator";
import { Simulator, SimulationResult } from "./simulator";
import { Relayer } from "./relayer";
import { createLogger } from "./logger";
import { DiscoveryService } from "./discovery";
import { RouteVerifier } from "./routeVerifier";
import { callWithFallback } from "./providers";

// ═══════════════════════════════════════════════
//  BASE ARBITRAGE PROTOCOL — API Server
// ═══════════════════════════════════════════════

const app = express();
// Ensure BigInt values are JSON-serializable (ethers v6 returns bigint for many calls).
app.set("json replacer", (_key: string, value: any) => (typeof value === "bigint" ? value.toString() : value));
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        log.info("HTTP", { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
    });
    next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Core modules
const poolMonitor = new PoolMonitor();
const simulator = new Simulator();
const relayer = new Relayer();
const routeVerifier = new RouteVerifier();
const discoveryService = new DiscoveryService((pair) => {
    poolMonitor.addPair(pair).catch(err => log.warn("Discovery failed to add pair", { pair: pair.name, err: String(err) }));
});
const log = createLogger("API");

const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

let cachedEthPrice: { usd: number; ts: number } | null = null;
async function getEthPriceUsd(): Promise<number> {
    const now = Date.now();
    if (cachedEthPrice && now - cachedEthPrice.ts < 30_000) return cachedEthPrice.usd;

    try {
        const weth = config.tokens.WETH.address;
        const usdc = config.tokens.USDC.address;
        const wethUsdc = config.pairs.find((p) => p.name === "WETH/USDC");
        const fee =
            wethUsdc?.v3Pools?.find((p) => (p.dex ?? "uniswapV3") === "uniswapV3")?.fee ??
            wethUsdc?.v3Pools?.[0]?.fee ??
            wethUsdc?.uniV3Pools?.[0]?.fee ??
            500;

        const quoter = new ethers.Contract(config.external.uniswapV3Quoter, QUOTER_ABI) as any;
        const result: any = await callWithFallback((p) =>
            quoter.connect(p).quoteExactInputSingle.staticCall({
                tokenIn: weth,
                tokenOut: usdc,
                amountIn: ethers.parseEther("1"),
                fee,
                sqrtPriceLimitX96: 0,
            })
        );
        const usd = parseFloat(ethers.formatUnits(result.amountOut, 6));
        cachedEthPrice = { usd, ts: now };
        return usd;
    } catch {
        const fallback = cachedEthPrice?.usd ?? 2500;
        cachedEthPrice = { usd: fallback, ts: now };
        return fallback;
    }
}

function isExecutionConfigured(): { ok: boolean; missing: string[]; optionalMissing: string[] } {
    const missing: string[] = [];
    if (!config.contracts.flashLoanExecutor) missing.push("FLASH_LOAN_EXECUTOR_ADDRESS");
    if (!config.contracts.treasury) missing.push("TREASURY_ADDRESS");
    if (!config.contracts.uniswapV3Adapter) missing.push("UNISWAP_V3_ADAPTER_ADDRESS");
    if (!config.contracts.aerodromeAdapter) missing.push("AERODROME_ADAPTER_ADDRESS");
    if (!config.relayerPrivateKey) missing.push("RELAYER_PRIVATE_KEY");
    const optionalMissing: string[] = [];
    if (!config.contracts.pancakeV3Adapter) optionalMissing.push("PANCAKESWAP_V3_ADAPTER_ADDRESS");
    return { ok: missing.length === 0, missing, optionalMissing };
}

// State
let activeOpportunities: SimulationResult[] = [];
let totalArbitrageVolume = "0";
let totalOpportunitiesFound = 0;
const lastScanAtByPair: Record<string, number> = {};

// ═══════════════════════════════════════════════
//  WebSocket — Broadcast opportunities in real-time
// ═══════════════════════════════════════════════

function broadcast(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on("connection", (ws) => {
    log.info("WS client connected");

    // Send current opportunities on connect
    ws.send(
        JSON.stringify({
            type: "opportunities",
            data: activeOpportunities,
            timestamp: Date.now(),
        })
    );

    ws.on("close", () => log.info("WS client disconnected"));
});

// ═══════════════════════════════════════════════
//  Pool Monitor Event Handler
// ═══════════════════════════════════════════════

poolMonitor.on("priceUpdate", async (update: PriceUpdate) => {
    try {
        // Debounce per pair to avoid excessive quoting on public RPCs.
        const now = Date.now();
        const last = lastScanAtByPair[update.pair] ?? 0;
        if (now - last < Math.max(1500, config.scanner.intervalMs - 500)) return;
        lastScanAtByPair[update.pair] = now;

        const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(update.pair);

        // Detect price spreads
        const spreads = PriceCalculator.detectSpreads(
            update.pair,
            update.pools,
            token0Decimals,
            token1Decimals,
            config.scanner.minSpreadPercent // default 0.05% net spread
        );

        if (spreads.length === 0) return;

        // Simulate top opportunities
        const simulations: SimulationResult[] = [];
        for (const spread of spreads.slice(0, 3)) {
            // Test with different input sizes (smaller amounts needed for WETH/high-value pairs)
            const amounts = [0.1, 1, 10, 50, 100, 500, 2_000, 10_000];
            for (const amount of amounts) {
                const sim = await simulator.simulate(spread, amount);
                if (sim && sim.netProfitable) {
                    simulations.push(sim);
                }
                // Also try borrowing token0 for WETH/USDC-like pairs (improves chances on asymmetric liquidity).
                const pairCfg = config.pairs.find((p) => p.name === spread.pair);
                if (pairCfg && (pairCfg.token0.toLowerCase() === config.tokens.WETH.address.toLowerCase() || pairCfg.token0.toLowerCase() === config.tokens.USDC.address.toLowerCase())) {
                    const sim2 = await simulator.simulateBorrowToken0(spread, amount);
                    if (sim2 && sim2.netProfitable) simulations.push(sim2);
                }
            }
        }

        if (simulations.length > 0) {
            // Keep best opportunities per pair (highest user profit)
            const bestSimulations = simulations
                .sort((a, b) => parseFloat(b.userProfit) - parseFloat(a.userProfit))
                .slice(0, 5);

            // Update active opportunities (replace same pair)
            activeOpportunities = [
                ...activeOpportunities.filter((o) => o.pair !== update.pair),
                ...bestSimulations,
            ].slice(0, 20); // Cap at 20

            totalOpportunitiesFound += bestSimulations.length;

            // Broadcast to frontend
            broadcast("opportunities", activeOpportunities);
            log.info("Scanner opportunities", { pair: update.pair, count: bestSimulations.length });
        }
    } catch (err) {
        log.warn("Scanner error processing update", { err: String(err) });
    }
});

// ═══════════════════════════════════════════════
//  REST API Endpoints
// ═══════════════════════════════════════════════

// Health check
app.get("/api/health", (req, res) => {
    const execConfig = isExecutionConfigured();
    res.json({
        status: "ok",
        uptime: process.uptime(),
        poolsMonitored: poolMonitor.getPoolStates().size,
        activeOpportunities: activeOpportunities.length,
        executionConfigured: execConfig.ok,
        missingEnv: execConfig.ok ? [] : execConfig.missing,
        optionalMissingEnv: execConfig.optionalMissing,
    });
});

// Get list of monitored pairs (including discovered ones)
app.get("/api/pairs", (req, res) => {
    const staticPairs = config.pairs.map(p => ({ name: p.name, source: "static" }));
    const discoveredPairs = discoveryService.getDiscoveredPairs().map(p => ({ name: p.name, source: "dynamic" }));
    res.json({ pairs: [...staticPairs, ...discoveredPairs] });
});

// Get current opportunities
app.get("/api/opportunities", (req, res) => {
    res.json({
        opportunities: activeOpportunities,
        count: activeOpportunities.length,
        timestamp: Date.now(),
    });
});

// Get current cross-DEX spreads (even if unprofitable). Useful to understand "why no opportunities".
app.get("/api/spreads", (req, res) => {
    const result = config.pairs.map((pair) => {
        const pools = poolMonitor.getPoolsByPair(pair.name);
        const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(pair.name);
        const prices = PriceCalculator.poolsToPrices(pools, token0Decimals, token1Decimals);

        // Net spreads (after fee estimate) where net > 0
        const spreads = PriceCalculator.detectSpreads(pair.name, pools, token0Decimals, token1Decimals, 0);

        // Raw spreads (before fees), even if net is negative (useful for diagnostics/UI).
        const rawPairs: any[] = [];
        const valid = prices.filter((p) => p.price > 0);
        for (let i = 0; i < valid.length; i++) {
            for (let j = i + 1; j < valid.length; j++) {
                const a = valid[i];
                const b = valid[j];
                const rawSpreadPercent = (Math.abs(a.price - b.price) / Math.min(a.price, b.price)) * 100;
                const feePercent = (Number(a.feeBps || 0) + Number(b.feeBps || 0)) / 100;
                const netSpreadPercent = rawSpreadPercent - feePercent;
                rawPairs.push({
                    a,
                    b,
                    rawSpreadPercent,
                    feePercent,
                    netSpreadPercent,
                    buyDex: a.price < b.price ? a.dex : b.dex,
                    sellDex: a.price < b.price ? b.dex : a.dex,
                });
            }
        }
        rawPairs.sort((x, y) => y.rawSpreadPercent - x.rawSpreadPercent);

        return {
            pair: pair.name,
            pools: prices,
            spreads,
            topRaw: rawPairs.slice(0, 3),
        };
    });

    res.json({ pairs: result, timestamp: Date.now() });
});

// Diagnostics: show best spread candidates (including unprofitable) with a few simulated notionals.
// This is intentionally not polled by the UI; use it when "opportunities" are blank.
app.get("/api/diagnostics/candidates", async (req, res) => {
    try {
        const pairFilter = typeof req.query.pair === "string" ? req.query.pair : "";
        const maxPairs = Math.max(1, Math.min(20, parseInt(String(req.query.maxPairs || "6"))));
        const notionals = [500, 2_000, 10_000];

        const selectedPairs = config.pairs
            .filter((p) => (pairFilter ? p.name === pairFilter : true))
            .slice(0, maxPairs);

        const out: any[] = [];

        for (const pair of selectedPairs) {
            const pools = poolMonitor.getPoolsByPair(pair.name);
            const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(pair.name);
            const prices = PriceCalculator.poolsToPrices(pools, token0Decimals, token1Decimals);
            const valid = prices.filter((p) => p.price > 0);

            const rawPairs: any[] = [];
            for (let i = 0; i < valid.length; i++) {
                for (let j = i + 1; j < valid.length; j++) {
                    const a = valid[i];
                    const b = valid[j];
                    const rawSpreadPercent = (Math.abs(a.price - b.price) / Math.min(a.price, b.price)) * 100;
                    const feePercent = (Number(a.feeBps || 0) + Number(b.feeBps || 0)) / 100;
                    const netSpreadPercent = rawSpreadPercent - feePercent;
                    rawPairs.push({
                        a,
                        b,
                        rawSpreadPercent,
                        feePercent,
                        netSpreadPercent,
                        buyDex: a.price < b.price ? a.dex : b.dex,
                        sellDex: a.price < b.price ? b.dex : a.dex,
                    });
                }
            }
            rawPairs.sort((x, y) => y.rawSpreadPercent - x.rawSpreadPercent);
            const best = rawPairs[0] || null;

            const simulations: any[] = [];
            if (best) {
                const buyPool = best.a.price < best.b.price ? best.a : best.b;
                const sellPool = best.a.price < best.b.price ? best.b : best.a;
                const spread = {
                    pair: pair.name,
                    buyPool,
                    sellPool,
                    spreadPercent: best.netSpreadPercent,
                    estimatedProfit: 0,
                    direction: "token0_to_token1" as const,
                    timestamp: Date.now(),
                };

                for (const n of notionals) {
                    const sim = await simulator.simulate(spread as any, n);
                    if (!sim) continue;
                    const reason =
                        BigInt(sim.userProfitRaw) <= 0n
                            ? "Gross profit <= 0 after fees/premium"
                            : sim.netProfitable
                                ? "Profitable"
                                : "Profit exists but gas/buffers dominate";
                    simulations.push({ ...sim, reason });
                }
            }

            out.push({
                pair: pair.name,
                pools: prices.length,
                bestRaw: best,
                simulations,
            });
        }

        res.json({ pairs: out, timestamp: Date.now() });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

// Execute an arbitrage opportunity
app.post("/api/execute", async (req, res) => {
    try {
        const { simulationId, userAddress } = req.body;

        const execConfig = isExecutionConfigured();
        if (!execConfig.ok) {
            return res.status(503).json({
                error: "Execution not configured on server",
                missingEnv: execConfig.missing,
            });
        }

        if (!simulationId || !userAddress) {
            return res.status(400).json({ error: "Missing simulationId or userAddress" });
        }

        if (!ethers.isAddress(userAddress)) {
            return res.status(400).json({ error: "Invalid userAddress" });
        }

        // Find the simulation
        const simulation = activeOpportunities.find((o) => o.id === simulationId);
        if (!simulation) {
            return res.status(404).json({ error: "Opportunity not found or expired" });
        }

        // Re-simulate to verify still profitable
        console.log(`[API] Re-simulating opportunity ${simulationId} before execution`);
        // For now, use the cached simulation
        // In production, re-simulate here

        if (!simulation.netProfitable) {
            return res.status(400).json({ error: "Opportunity no longer profitable" });
        }
        if (!simulation.executionReady) {
            return res.status(409).json({ error: "Opportunity not executable (missing adapters)", missingAdapters: simulation.missingAdapters });
        }

        // Execute via relayer
        const result = await relayer.execute(simulation, userAddress);

        // Broadcast execution result
        broadcast("execution", result);

        // Remove executed opportunity
        activeOpportunities = activeOpportunities.filter((o) => o.id !== simulationId);
        broadcast("opportunities", activeOpportunities);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Execute using a user-signed intent (hybrid execution)
app.post("/api/intent/submit", async (req, res) => {
    try {
        const execConfig = isExecutionConfigured();
        if (!execConfig.ok) {
            return res.status(503).json({
                error: "Execution not configured on server",
                missingEnv: execConfig.missing,
            });
        }

        const { intent, steps, signature } = req.body || {};
        if (!intent || !steps || !signature) {
            return res.status(400).json({ error: "Missing intent, steps, or signature" });
        }

        if (!ethers.isAddress(intent.user) || !ethers.isAddress(intent.asset)) {
            return res.status(400).json({ error: "Invalid intent addresses" });
        }
        if (typeof intent.routeHash !== "string" || !intent.routeHash.startsWith("0x")) {
            return res.status(400).json({ error: "Invalid routeHash" });
        }
        if (typeof signature !== "string" || !signature.startsWith("0x")) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        // Basic route hash verification on the server (defense-in-depth; contract also checks)
        const coder = ethers.AbiCoder.defaultAbiCoder();
        const normalizedSteps = (steps as any[]).map((s) => ({
            adapter: s.adapter,
            tokenIn: s.tokenIn,
            tokenOut: s.tokenOut,
            amountIn: BigInt(s.amountIn),
            minAmountOut: BigInt(s.minAmountOut),
            data: s.data,
        }));

        if (normalizedSteps.length < 2) {
            return res.status(400).json({ error: "Route must have at least 2 steps" });
        }
        if (
            String(normalizedSteps[0].tokenIn).toLowerCase() !== String(intent.asset).toLowerCase() ||
            String(normalizedSteps[normalizedSteps.length - 1].tokenOut).toLowerCase() !==
            String(intent.asset).toLowerCase()
        ) {
            return res.status(400).json({ error: "Route must start/end in borrowed asset" });
        }
        if (normalizedSteps.some((s) => s.minAmountOut <= BigInt(0))) {
            return res.status(400).json({ error: "minAmountOut must be > 0" });
        }

        const encoded = coder.encode(
            [
                "tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[]",
            ],
            [normalizedSteps]
        );
        const computed = ethers.keccak256(encoded);
        if (computed.toLowerCase() !== String(intent.routeHash).toLowerCase()) {
            return res.status(400).json({ error: "routeHash mismatch" });
        }

        // Re-simulate/verify on the server just before submitting a transaction.
        const verification = await routeVerifier.verifyIntent(intent, steps, signature);
        if (!verification.ok) {
            return res.status(422).json({ error: "Intent not profitable", reason: verification.reason });
        }

        const minRequiredUsd = Math.max(0, config.scanner.minProfitUsd + config.scanner.profitBufferUsd);
        const assetLower = String(intent.asset).toLowerCase();
        const usdcLower = config.tokens.USDC.address.toLowerCase();
        const wethLower = config.tokens.WETH.address.toLowerCase();

        if (assetLower === usdcLower) {
            const minRaw = ethers.parseUnits(minRequiredUsd.toFixed(6), 6);
            if ((verification.userProfit ?? 0n) < minRaw) {
                return res.status(422).json({ error: "Profit below threshold", minRequiredUsd });
            }
        } else if (assetLower === wethLower) {
            const ethPriceUsd = await getEthPriceUsd();
            const userProfitEth = parseFloat(ethers.formatEther(verification.userProfit ?? 0n));
            const userProfitUsd = userProfitEth * ethPriceUsd;
            if (userProfitUsd < minRequiredUsd) {
                return res.status(422).json({ error: "Profit below threshold", minRequiredUsd, userProfitUsd });
            }
        }

        const result = await relayer.executeWithIntent(intent, steps, signature);
        broadcast("execution", result);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Get execution history
app.get("/api/history", (req, res) => {
    const history = relayer.getHistory();
    res.json({ history, count: history.length });
});

// Get protocol analytics
app.get("/api/analytics", async (req, res) => {
    try {
        const stats = await relayer.getStats();
        const poolStates = poolMonitor.getPoolStates();
        const history = relayer.getHistory();
        const attempts = history.length;
        const successes = history.filter((h) => h.success).length;
        const successRate = attempts > 0 ? successes / attempts : 0;

        // Calculate pool prices for display
        const pairPrices = config.pairs.map((pair) => {
            const pools = poolMonitor.getPoolsByPair(pair.name);
            const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(pair.name);
            const prices = PriceCalculator.poolsToPrices(pools, token0Decimals, token1Decimals);
            return { pair: pair.name, prices };
        });

        function tokenMeta(address: string): { symbol: string; decimals: number } | null {
            const t = Object.values(config.tokens).find((x) => x.address.toLowerCase() === address.toLowerCase());
            return t ? { symbol: t.symbol, decimals: t.decimals } : null;
        }

        const ethPriceUsd = await getEthPriceUsd();
        const usdc = config.tokens.USDC.address.toLowerCase();
        const weth = config.tokens.WETH.address.toLowerCase();

        const totalsByAsset = (stats.totalsByAsset ?? []).map((t) => {
            const meta = tokenMeta(t.asset);
            const decimals = meta?.decimals ?? 18;
            const volumeHuman = ethers.formatUnits(t.totalVolume, decimals);
            const userProfitHuman = ethers.formatUnits(t.totalUserProfit, decimals);
            const protocolRevenueHuman = ethers.formatUnits(t.totalProtocolFees, decimals);

            const toUsd = (human: string): number | null => {
                const n = Number(human);
                if (!Number.isFinite(n)) return null;
                if (t.asset.toLowerCase() === usdc) return n;
                if (t.asset.toLowerCase() === weth) return n * ethPriceUsd;
                return null;
            };

            return {
                asset: t.asset,
                symbol: meta?.symbol ?? "UNKNOWN",
                decimals,
                totalVolumeRaw: t.totalVolume,
                totalVolume: volumeHuman,
                totalVolumeUsd: toUsd(volumeHuman),
                totalUserProfitRaw: t.totalUserProfit,
                totalUserProfit: userProfitHuman,
                totalUserProfitUsd: toUsd(userProfitHuman),
                totalProtocolRevenueRaw: t.totalProtocolFees,
                totalProtocolRevenue: protocolRevenueHuman,
                totalProtocolRevenueUsd: toUsd(protocolRevenueHuman),
                totalProfitGeneratedRaw: t.totalProfitGenerated,
                totalProfitGenerated: ethers.formatUnits(t.totalProfitGenerated, decimals),
                totalGasRefundedRaw: t.totalGasRefunded,
                totalGasRefunded: ethers.formatUnits(t.totalGasRefunded, decimals),
            };
        });

        const sumUsd = (field: "totalVolumeUsd" | "totalUserProfitUsd" | "totalProtocolRevenueUsd") =>
            totalsByAsset.reduce((acc, x) => acc + (typeof x[field] === "number" ? (x[field] as number) : 0), 0);

        const dexLiquidity = Array.from(poolStates.values()).map((p) => {
            const t0 = tokenMeta(p.token0);
            const t1 = tokenMeta(p.token1);
            const reserve0 = p.reserve0 && t0 ? ethers.formatUnits(p.reserve0, t0.decimals) : null;
            const reserve1 = p.reserve1 && t1 ? ethers.formatUnits(p.reserve1, t1.decimals) : null;
            return {
                address: p.address,
                dex: p.dex,
                pair: p.pair,
                token0: { address: p.token0, symbol: t0?.symbol ?? "UNKNOWN", decimals: t0?.decimals ?? 18 },
                token1: { address: p.token1, symbol: t1?.symbol ?? "UNKNOWN", decimals: t1?.decimals ?? 18 },
                uniV3: p.dex === "uniswapV3"
                    ? { liquidity: p.liquidity?.toString() ?? "0", fee: p.fee ?? 0, tick: p.tick ?? 0 }
                    : null,
                pancakeV3: p.dex === "pancakeV3"
                    ? { liquidity: p.liquidity?.toString() ?? "0", fee: p.fee ?? 0, tick: p.tick ?? 0 }
                    : null,
                aerodrome: p.dex === "aerodrome"
                    ? { reserve0: p.reserve0?.toString() ?? "0", reserve1: p.reserve1?.toString() ?? "0", stable: !!p.stable, reserve0Human: reserve0, reserve1Human: reserve1 }
                    : null,
                lastUpdated: p.lastUpdated,
            };
        });

        const dexOverview = dexLiquidity.reduce(
            (acc, p) => {
                acc.totalPools += 1;
                if (p.dex === "uniswapV3") acc.uniswapV3Pools += 1;
                if (p.dex === "pancakeV3") acc.pancakeV3Pools += 1;
                if (p.dex === "aerodrome") acc.aerodromePools += 1;
                return acc;
            },
            { totalPools: 0, uniswapV3Pools: 0, pancakeV3Pools: 0, aerodromePools: 0 }
        );

        res.json({
            protocol: {
                totalExecutions: stats.totalExecutions,
                totalProfitGenerated: stats.totalProfitGenerated,
                totalOpportunitiesFound,
                feePercent: config.protocol.feePercent,
                totalsByAsset,
                totalsUsd: {
                    totalArbitrageVolumeUsd: sumUsd("totalVolumeUsd"),
                    totalUserProfitUsd: sumUsd("totalUserProfitUsd"),
                    totalProtocolRevenueUsd: sumUsd("totalProtocolRevenueUsd"),
                    ethPriceUsd,
                },
                success: {
                    attempts,
                    successes,
                    successRate,
                    inefficienciesCorrected: successes,
                },
            },
            pools: {
                monitored: poolStates.size,
                pairs: pairPrices,
                dexOverview,
                dexLiquidity,
            },
            relayer: {
                address: relayer.getAddress(),
                executionCount: relayer.getHistory().length,
            },
            timestamp: Date.now(),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get pool states (debug/info endpoint)
app.get("/api/pools", (req, res) => {
    const pools: any[] = [];
    poolMonitor.getPoolStates().forEach((state, address) => {
        pools.push({
            ...state,
            sqrtPriceX96: state.sqrtPriceX96?.toString(),
            liquidity: state.liquidity?.toString(),
            reserve0: state.reserve0?.toString(),
            reserve1: state.reserve1?.toString(),
        });
    });
    res.json({ pools, count: pools.length });
});

// ═══════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════

async function main() {
    console.log("═══════════════════════════════════════════════");
    console.log("  BASE ARBITRAGE PROTOCOL — Backend Scanner");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Network:    Base Mainnet (${config.chainId})`);
    console.log(`  RPC:        ${config.rpcUrl}`);
    console.log(`  Port:       ${config.server.port}`);
    console.log(`  Relayer:    ${relayer.getAddress()}`);
    console.log(`  Pairs:      ${config.pairs.map((p) => p.name).join(", ")}`);
    console.log(`  Fee:        ${config.protocol.feePercent}%`);
    console.log("═══════════════════════════════════════════════\n");

    // Start HTTP + WebSocket server
    server.listen(config.server.port, config.server.host, () => {
        console.log(`[Server] API running on http://${config.server.host}:${config.server.port}`);
        console.log(`[Server] WebSocket on ws://${config.server.host}:${config.server.port}`);
    });

    // Start pool monitoring (async, so API is available immediately even if RPCs are flaky).
    poolMonitor.start().catch((err) => {
        log.error("PoolMonitor failed to start", { err: String(err) });
    });

    // Start pair discovery
    discoveryService.start().catch((err) => {
        log.error("DiscoveryService failed to start", { err: String(err) });
    });
}

main().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    poolMonitor.stop();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    poolMonitor.stop();
    server.close();
    process.exit(0);
});
