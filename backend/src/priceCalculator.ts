import { PoolState } from "./poolMonitor";
import { config } from "./config";

// ═══════════════════════════════════════════════
//  Price Calculator — Converts pool state to prices
//  and detects cross-DEX price inefficiencies
// ═══════════════════════════════════════════════

export interface PricePoint {
    poolAddress: string;
    dex: string;
    price: number;          // Price of token0 in terms of token1
    inversePrice: number;   // Price of token1 in terms of token0
    liquidity: string;      // Human-readable liquidity
    feeBps: number;         // Pool fee in basis points (bps)
    feeTier?: number;       // Uniswap V3 fee tier (e.g., 500/3000/10000)
    stable?: boolean;       // Aerodrome stable pool flag (if applicable)
}

export interface PriceSpread {
    pair: string;
    buyPool: PricePoint;    // Pool where token0 is cheaper (buy here)
    sellPool: PricePoint;   // Pool where token0 is more expensive (sell here)
    spreadPercent: number;  // Price spread as percentage
    estimatedProfit: number; // Rough profit estimate
    direction: "token0_to_token1" | "token1_to_token0";
    timestamp: number;
}

export class PriceCalculator {
    /**
     * Calculate price from Uniswap V3 sqrtPriceX96
     * price = (sqrtPriceX96 / 2^96)^2
     */
    static uniV3Price(
        sqrtPriceX96: bigint,
        token0Decimals: number,
        token1Decimals: number,
        tick?: number
    ): number {
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);

        // Prefer tick-based computation when available to avoid bigint -> number precision loss
        if (typeof tick === "number") {
            const rawPrice = Math.pow(1.0001, tick);
            return rawPrice * decimalAdjustment;
        }

        // Fallback: sqrtPriceX96-based computation (approximate in JS number space)
        const Q96 = 2 ** 96;
        const sqrt = Number(sqrtPriceX96) / Q96;
        const rawPrice = sqrt * sqrt;
        return rawPrice * decimalAdjustment;
    }

    /**
     * Calculate price from Aerodrome reserves (constant product AMM)
     * price = reserve1 / reserve0 (with decimal adjustment)
     */
    static aeroPrice(
        reserve0: bigint,
        reserve1: bigint,
        token0Decimals: number,
        token1Decimals: number,
        stable: boolean = false
    ): number {
        if (reserve0 === BigInt(0) || reserve1 === BigInt(0)) return 0;

        const r0 = Number(reserve0) / 10 ** token0Decimals;
        const r1 = Number(reserve1) / 10 ** token1Decimals;

        if (!stable) {
            // Volatile (x * y = k) -> Price = y / x
            return r1 / r0;
        } else {
            // Stable (x^3*y + y^3*x = k) -> Price = (3x^2y + y^3) / (x^3 + 3xy^2)
            // Note: This is dy/dx (price of token0 in terms of token1)
            const r0_2 = r0 * r0;
            const r0_3 = r0_2 * r0;
            const r1_2 = r1 * r1;
            const r1_3 = r1_2 * r1;

            const numerator = 3 * r0_2 * r1 + r1_3;
            const denominator = r0_3 + 3 * r0 * r1_2;

            return numerator / denominator;
        }
    }

    /**
     * Convert pool states to price points
     */
    static poolsToPrices(
        pools: PoolState[],
        token0Decimals: number,
        token1Decimals: number
    ): PricePoint[] {
        return pools.map((pool) => {
            let price: number;
            let feeTier: number | undefined;
            let feeBps: number;

            const isV3 = (pool.dex === "uniswapV3" || pool.dex === "pancakeV3");
            if (isV3 && pool.sqrtPriceX96) {
                feeTier = pool.fee;
                // Uniswap V3 fee tier (e.g., 500 = 0.05%) -> bps (e.g., 5 bps)
                feeBps = typeof feeTier === "number" ? Math.round(feeTier / 100) : 30;
                price = this.uniV3Price(pool.sqrtPriceX96, token0Decimals, token1Decimals, pool.tick);
            } else if (pool.dex === "aerodrome" && pool.reserve0 && pool.reserve1) {
                price = this.aeroPrice(pool.reserve0, pool.reserve1, token0Decimals, token1Decimals, !!pool.stable);
                // Aerodrome fee varies by pool; use a conservative default (0.30% = 30 bps).
                feeBps = 30;
            } else {
                price = 0;
                feeBps = 30;
            }

            return {
                poolAddress: pool.address,
                dex: pool.dex === "uniswapV3" ? "Uniswap V3" : pool.dex === "pancakeV3" ? "PancakeSwap V3" : "Aerodrome",
                price,
                inversePrice: price > 0 ? 1 / price : 0,
                liquidity: pool.liquidity
                    ? pool.liquidity.toString()
                    : pool.reserve0
                        ? `${pool.reserve0.toString()}/${pool.reserve1?.toString()}`
                        : "0",
                feeBps,
                feeTier,
                stable: pool.stable,
            };
        });
    }

    /**
     * Detect price spreads between pools for arbitrage opportunities
     */
    static detectSpreads(
        pair: string,
        pools: PoolState[],
        token0Decimals: number,
        token1Decimals: number,
        minSpreadPercent: number = 0.1
    ): PriceSpread[] {
        const prices = this.poolsToPrices(pools, token0Decimals, token1Decimals);
        const validPrices = prices.filter((p) => p.price > 0);

        if (validPrices.length < 2) return [];

        const spreads: PriceSpread[] = [];

        for (let i = 0; i < validPrices.length; i++) {
            for (let j = i + 1; j < validPrices.length; j++) {
                const a = validPrices[i];
                const b = validPrices[j];

                // Calculate spread percentage
                const spreadPercent = Math.abs(a.price - b.price) / Math.min(a.price, b.price) * 100;

                // Account for fees
                const totalFeeBps = a.feeBps + b.feeBps;
                const feePercent = totalFeeBps / 100; // 1 bps = 0.01%

                // Net spread after fees
                const netSpread = spreadPercent - feePercent;

                if (netSpread > minSpreadPercent) {
                    const buyPool = a.price < b.price ? a : b;
                    const sellPool = a.price < b.price ? b : a;

                    spreads.push({
                        pair,
                        buyPool,
                        sellPool,
                        spreadPercent: netSpread,
                        estimatedProfit: 0, // Will be calculated by simulator
                        direction: "token0_to_token1",
                        timestamp: Date.now(),
                    });
                }
            }
        }

        return spreads.sort((a, b) => b.spreadPercent - a.spreadPercent);
    }

    /**
     * Get token decimals for a pair config
     */
    static getDecimals(pairName: string): { token0Decimals: number; token1Decimals: number } {
        const pair = config.pairs.find((p) => p.name === pairName);
        if (!pair) return { token0Decimals: 18, token1Decimals: 18 };

        const token0Config = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === pair.token0.toLowerCase()
        );
        const token1Config = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === pair.token1.toLowerCase()
        );

        return {
            token0Decimals: token0Config?.decimals || 18,
            token1Decimals: token1Config?.decimals || 18,
        };
    }
}
