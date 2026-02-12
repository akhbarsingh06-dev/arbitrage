import { ethers } from "ethers";
import { config } from "./config";
import { PriceSpread } from "./priceCalculator";
import { callWithFallback, createRpcProvider } from "./providers";

// ═══════════════════════════════════════════════
//  Simulator — Simulates arbitrage via static calls
// ═══════════════════════════════════════════════

export interface SimulationResult {
    id: string;
    pair: string;
    buyDex: string;
    sellDex: string;
    buyPool: string;
    sellPool: string;
    inputToken: string;
    inputAmount: string;       // Human-readable
    inputAmountRaw: string;    // Wei / smallest unit
    grossProfit: string;
    grossProfitRaw: string;
    protocolFee: string;
    protocolFeeRaw: string;
    userProfit: string;
    userProfitRaw: string;
    gasEstimate: string;
    gasCostEth: string;
    gasCostUsd: string;
    netProfitable: boolean;
    executionReady: boolean;
    missingAdapters: string[];
    spreadPercent: number;
    timestamp: number;
    route: SwapRoute;
}

export interface SwapRoute {
    steps: SwapStep[];
    flashLoanToken: string;
    flashLoanAmount: string;
}

export interface SwapStep {
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    data: string;
    dex: string;
}

// Uniswap V3 Quoter ABI
const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

// Aerodrome Router ABI for getAmountsOut
const AERO_ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
    "function defaultFactory() view returns (address)",
];

export class Simulator {
    private provider: ethers.Provider;
    private uniQuoter: any;
    private pancakeQuoter: any;
    private aeroRouter: ethers.Contract;
    private aeroFactory?: string;
    private simulationCount = 0;

    constructor() {
        this.provider = createRpcProvider();
        this.uniQuoter = new ethers.Contract(
            config.external.uniswapV3Quoter,
            QUOTER_ABI,
            this.provider
        ) as any;
        this.pancakeQuoter = new ethers.Contract(
            config.external.pancakeswapV3Quoter,
            QUOTER_ABI,
            this.provider
        ) as any;
        this.aeroRouter = new ethers.Contract(
            config.external.aerodromeRouter,
            AERO_ROUTER_ABI,
            this.provider
        );
    }

    /**
     * Simulate an arbitrage opportunity
     */
    async simulate(
        spread: PriceSpread,
        inputAmountHuman: number = 1.0
    ): Promise<SimulationResult | null> {
        try {
            const pair = config.pairs.find((p) => p.name === spread.pair);
            if (!pair) return null;

            // Determine input token and decimals
            const token0Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token0.toLowerCase()
            );
            const token1Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token1.toLowerCase()
            );

            if (!token0Config || !token1Config) return null;

            // For token0 → token1 → token0 arb:
            // 1. Buy token0 cheap on buyPool (swap token1 → token0)
            // 2. Sell token0 expensive on sellPool (swap token0 → token1)
            // But we need to start with a flash loan of one of the tokens

            // Base model (default): borrow token1 (e.g. USDC), buy token0 cheap, sell token0 expensive, repay token1.
            const flashToken = pair.token1;
            const flashDecimals = token1Config.decimals;
            const inputAmountRaw = ethers.parseUnits(inputAmountHuman.toFixed(flashDecimals), flashDecimals);

            const buyAmountOut = await this.quoteSwap(
                spread.buyPool.poolAddress,
                spread.buyPool.dex,
                pair.token1,
                pair.token0,
                inputAmountRaw,
                spread.buyPool.feeTier,
                spread.buyPool.stable
            );
            if (!buyAmountOut || buyAmountOut === 0n) return null;

            const sellAmountOut = await this.quoteSwap(
                spread.sellPool.poolAddress,
                spread.sellPool.dex,
                pair.token0,
                pair.token1,
                buyAmountOut,
                spread.sellPool.feeTier,
                spread.sellPool.stable
            );
            if (!sellAmountOut || sellAmountOut === 0n) return null;

            // Calculate profit
            const flashFee = (inputAmountRaw * BigInt(5)) / BigInt(10000); // 0.05% Aave fee
            const totalCost = inputAmountRaw + flashFee;

            const grossProfitRaw = sellAmountOut > totalCost
                ? sellAmountOut - totalCost
                : BigInt(0);

            // Calculate protocol fee (15%)
            const protocolFeeRaw = (grossProfitRaw * BigInt(1500)) / BigInt(10000);
            const userProfitRaw = grossProfitRaw - protocolFeeRaw;

            // Estimate gas
            const gasEstimate = BigInt(350000); // Conservative estimate
            const feeData = await callWithFallback((p) => p.getFeeData());
            const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? BigInt(0);
            const gasCostWei = gasEstimate * gasPriceWei;
            const gasCostEth = ethers.formatEther(gasCostWei);
            const ethPriceUsd = await this.getEthPriceUsd();
            const gasCostUsd = (parseFloat(gasCostEth) * ethPriceUsd).toFixed(4);

            // Check if profitable after gas
            const userProfitHuman = parseFloat(ethers.formatUnits(userProfitRaw, flashDecimals));
            const flashTokenLower = flashToken.toLowerCase();
            const isUsdStable =
                flashTokenLower === config.tokens.USDC.address.toLowerCase();

            const gasCostInProfitToken = isUsdStable
                ? parseFloat(gasCostUsd) // USDC-ish
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? parseFloat(gasCostEth) // WETH-ish
                    : 0; // Unknown token; can't safely denominate gas here

            const minRequiredUsd = Math.max(0, config.scanner.minProfitUsd + config.scanner.profitBufferUsd);
            const minRequiredInProfitToken = isUsdStable
                ? minRequiredUsd
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? minRequiredUsd / Math.max(1e-9, ethPriceUsd)
                    : 0;

            const required = gasCostInProfitToken > 0
                ? gasCostInProfitToken + minRequiredInProfitToken
                : minRequiredInProfitToken;

            const netProfitable = gasCostInProfitToken > 0
                ? userProfitHuman > required
                : userProfitRaw > BigInt(0);

            // Build swap route
            const slippageBps = config.scanner.defaultSlippageBps;
            const missingAdapters: string[] = [];
            const route: SwapRoute = {
                flashLoanToken: flashToken,
                flashLoanAmount: inputAmountRaw.toString(),
                steps: [
                    this.buildSwapStep(
                        spread.buyPool,
                        pair.token1,
                        pair.token0,
                        inputAmountRaw,
                        this.applySlippageToMinOut(buyAmountOut, slippageBps),
                        missingAdapters
                    ),
                    this.buildSwapStep(
                        spread.sellPool,
                        pair.token0,
                        pair.token1,
                        buyAmountOut,
                        this.applySlippageToMinOut(sellAmountOut, slippageBps),
                        missingAdapters
                    ),
                ],
            };

            this.simulationCount++;

            return {
                id: `sim-${this.simulationCount}-${Date.now()}`,
                pair: spread.pair,
                buyDex: spread.buyPool.dex,
                sellDex: spread.sellPool.dex,
                buyPool: spread.buyPool.poolAddress,
                sellPool: spread.sellPool.poolAddress,
                inputToken: token1Config.symbol,
                inputAmount: inputAmountHuman.toFixed(flashDecimals),
                inputAmountRaw: inputAmountRaw.toString(),
                grossProfit: ethers.formatUnits(grossProfitRaw, flashDecimals),
                grossProfitRaw: grossProfitRaw.toString(),
                protocolFee: ethers.formatUnits(protocolFeeRaw, flashDecimals),
                protocolFeeRaw: protocolFeeRaw.toString(),
                userProfit: ethers.formatUnits(userProfitRaw, flashDecimals),
                userProfitRaw: userProfitRaw.toString(),
                gasEstimate: gasEstimate.toString(),
                gasCostEth,
                gasCostUsd,
                netProfitable,
                executionReady: missingAdapters.length === 0,
                missingAdapters,
                spreadPercent: spread.spreadPercent,
                timestamp: Date.now(),
                route,
            };
        } catch (err) {
            console.error("[Simulator] Simulation failed:", err);
            return null;
        }
    }

    /**
     * Secondary model (optional): borrow token0, sell on sellPool, buy back on buyPool, repay token0.
     * Used for WETH/USDC-style pairs where gas/profit denomination is supported (WETH or USDC).
     */
    async simulateBorrowToken0(spread: PriceSpread, inputAmountToken1Human: number): Promise<SimulationResult | null> {
        try {
            const pair = config.pairs.find((p) => p.name === spread.pair);
            if (!pair) return null;

            const token0Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token0.toLowerCase()
            );
            const token1Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token1.toLowerCase()
            );
            if (!token0Config || !token1Config) return null;

            // Derive a token0 input amount from a token1 notional using the mid price.
            const midPrice = (spread.buyPool.price + spread.sellPool.price) / 2;
            if (!Number.isFinite(midPrice) || midPrice <= 0) return null;
            const token0Human = inputAmountToken1Human / midPrice;

            const inputAmountRaw = ethers.parseUnits(token0Human.toFixed(token0Config.decimals), token0Config.decimals);
            if (inputAmountRaw <= 0n) return null;

            // Step 1: sell token0 -> token1 on sellPool (token0 expensive)
            const sellOutToken1 = await this.quoteSwap(
                spread.sellPool.poolAddress,
                spread.sellPool.dex,
                pair.token0,
                pair.token1,
                inputAmountRaw,
                spread.sellPool.feeTier,
                spread.sellPool.stable
            );
            if (!sellOutToken1 || sellOutToken1 === 0n) return null;

            // Step 2: buy back token0 on buyPool (token0 cheap)
            const buyBackToken0 = await this.quoteSwap(
                spread.buyPool.poolAddress,
                spread.buyPool.dex,
                pair.token1,
                pair.token0,
                sellOutToken1,
                spread.buyPool.feeTier,
                spread.buyPool.stable
            );
            if (!buyBackToken0 || buyBackToken0 === 0n) return null;

            const flashFee = (inputAmountRaw * 5n) / 10000n;
            const totalCost = inputAmountRaw + flashFee;
            const grossProfitRaw = buyBackToken0 > totalCost ? buyBackToken0 - totalCost : 0n;

            const protocolFeeRaw = (grossProfitRaw * 1500n) / 10000n;
            const userProfitRaw = grossProfitRaw - protocolFeeRaw;

            const gasEstimate = 350000n;
            const feeData = await callWithFallback((p) => p.getFeeData());
            const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
            const gasCostWei = gasEstimate * gasPriceWei;
            const gasCostEth = ethers.formatEther(gasCostWei);
            const ethPriceUsd = await this.getEthPriceUsd();
            const gasCostUsd = (parseFloat(gasCostEth) * ethPriceUsd).toFixed(4);

            const userProfitHuman = parseFloat(ethers.formatUnits(userProfitRaw, token0Config.decimals));
            const flashTokenLower = pair.token0.toLowerCase();
            const isUsdStable = flashTokenLower === config.tokens.USDC.address.toLowerCase();

            const gasCostInProfitToken = isUsdStable
                ? parseFloat(gasCostUsd)
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? parseFloat(gasCostEth)
                    : 0;

            const minRequiredUsd = Math.max(0, config.scanner.minProfitUsd + config.scanner.profitBufferUsd);
            const minRequiredInProfitToken = isUsdStable
                ? minRequiredUsd
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? minRequiredUsd / Math.max(1e-9, ethPriceUsd)
                    : 0;

            const required = gasCostInProfitToken > 0 ? gasCostInProfitToken + minRequiredInProfitToken : minRequiredInProfitToken;
            const netProfitable = gasCostInProfitToken > 0 ? userProfitHuman > required : userProfitRaw > 0n;

            const slippageBps = config.scanner.defaultSlippageBps;
            const missingAdapters: string[] = [];
            const route: SwapRoute = {
                flashLoanToken: pair.token0,
                flashLoanAmount: inputAmountRaw.toString(),
                steps: [
                    this.buildSwapStep(
                        spread.sellPool,
                        pair.token0,
                        pair.token1,
                        inputAmountRaw,
                        this.applySlippageToMinOut(sellOutToken1, slippageBps),
                        missingAdapters
                    ),
                    this.buildSwapStep(
                        spread.buyPool,
                        pair.token1,
                        pair.token0,
                        sellOutToken1,
                        this.applySlippageToMinOut(buyBackToken0, slippageBps),
                        missingAdapters
                    ),
                ],
            };

            this.simulationCount++;

            return {
                id: `sim-${this.simulationCount}-${Date.now()}`,
                pair: spread.pair,
                buyDex: spread.buyPool.dex,
                sellDex: spread.sellPool.dex,
                buyPool: spread.buyPool.poolAddress,
                sellPool: spread.sellPool.poolAddress,
                inputToken: token0Config.symbol,
                inputAmount: ethers.formatUnits(inputAmountRaw, token0Config.decimals),
                inputAmountRaw: inputAmountRaw.toString(),
                grossProfit: ethers.formatUnits(grossProfitRaw, token0Config.decimals),
                grossProfitRaw: grossProfitRaw.toString(),
                protocolFee: ethers.formatUnits(protocolFeeRaw, token0Config.decimals),
                protocolFeeRaw: protocolFeeRaw.toString(),
                userProfit: ethers.formatUnits(userProfitRaw, token0Config.decimals),
                userProfitRaw: userProfitRaw.toString(),
                gasEstimate: gasEstimate.toString(),
                gasCostEth,
                gasCostUsd,
                netProfitable,
                executionReady: missingAdapters.length === 0,
                missingAdapters,
                spreadPercent: spread.spreadPercent,
                timestamp: Date.now(),
                route,
            };
        } catch {
            return null;
        }
    }

    private isV3DexLabel(dex: string): boolean {
        return dex === "Uniswap V3" || dex === "PancakeSwap V3";
    }

    private getV3QuoterForLabel(dex: string): any {
        return dex === "PancakeSwap V3" ? this.pancakeQuoter : this.uniQuoter;
    }

    private async quoteSwap(
        poolAddress: string,
        dex: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        feeTier?: number,
        stable?: boolean
    ): Promise<bigint | null> {
        try {
            if (this.isV3DexLabel(dex)) {
                if (typeof feeTier !== "number") return null;
                const quoter = this.getV3QuoterForLabel(dex);
                const result = await callWithFallback((p) =>
                    quoter.connect(p).quoteExactInputSingle.staticCall({
                        tokenIn,
                        tokenOut,
                        amountIn,
                        fee: feeTier,
                        sqrtPriceLimitX96: 0,
                    })
                );
                return (result as any).amountOut ?? result;
            } else {
                // Aerodrome
                if (!this.aeroFactory) {
                    this.aeroFactory = await this.aeroRouter.defaultFactory();
                }
                const routes = [{
                    from: tokenIn,
                    to: tokenOut,
                    stable: !!stable,
                    factory: this.aeroFactory,
                }];
                const amounts = await callWithFallback(async (p) => {
                    const router = this.aeroRouter.connect(p) as any;
                    return router.getAmountsOut(amountIn, routes);
                });
                return amounts[amounts.length - 1];
            }
        } catch (err) {
            return null;
        }
    }

    private buildSwapStep(
        pool: { poolAddress: string; dex: string; feeTier?: number; stable?: boolean },
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        minAmountOut: bigint,
        missingAdapters: string[]
    ): SwapStep {
        const isUniV3 = pool.dex === "Uniswap V3";
        const isPancakeV3 = pool.dex === "PancakeSwap V3";
        const isV3 = isUniV3 || isPancakeV3;

        const adapter = isUniV3
            ? config.contracts.uniswapV3Adapter
            : isPancakeV3
                ? config.contracts.pancakeV3Adapter
                : config.contracts.aerodromeAdapter;

        if (!adapter) {
            missingAdapters.push(pool.dex);
        }

        return {
            adapter: adapter || ethers.ZeroAddress,
            tokenIn,
            tokenOut,
            amountIn: amountIn.toString(),
            minAmountOut: minAmountOut.toString(),
            data: isV3
                ? ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [pool.feeTier ?? 3000])
                : ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!!pool.stable]),
            dex: pool.dex,
        };
    }

    private applySlippageToMinOut(amountOut: bigint, slippageBps: number): bigint {
        if (slippageBps <= 0) return amountOut;
        if (slippageBps >= 10_000) return BigInt(0);
        const minOut = (amountOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
        if (amountOut > BigInt(0) && minOut === BigInt(0)) return BigInt(1);
        return minOut;
    }

    private async getEthPriceUsd(): Promise<number> {
        try {
            // Get ETH price from WETH/USDC pool
            const wethUsdc = config.pairs.find((p) => p.name === "WETH/USDC");
            const fee =
                wethUsdc?.v3Pools?.find((p) => (p.dex ?? "uniswapV3") === "uniswapV3")?.fee ??
                wethUsdc?.v3Pools?.[0]?.fee ??
                wethUsdc?.uniV3Pools?.[0]?.fee ??
                500;
            if (!wethUsdc) return 2500; // Fallback

            const result = await callWithFallback<any>((p) =>
                this.uniQuoter.connect(p).quoteExactInputSingle.staticCall({
                    tokenIn: config.tokens.WETH.address,
                    tokenOut: config.tokens.USDC.address,
                    amountIn: ethers.parseEther("1"),
                    fee,
                    sqrtPriceLimitX96: 0,
                })
            );

            return parseFloat(ethers.formatUnits(result.amountOut ?? result, 6));
        } catch {
            return 2500; // Fallback ETH price
        }
    }
}
