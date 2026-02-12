import { ethers } from "ethers";
import { config, PairConfig } from "./config";
import { EventEmitter } from "events";
import { createLogger } from "./logger";
import { callWithFallback, createRpcProvider, createWsProvider, getWsUrls } from "./providers";

// ═══════════════════════════════════════════════
//  Pool Monitor — Listens for Swap events on DEX pools
// ═══════════════════════════════════════════════

// Uniswap V3 Pool ABI (minimal)
const V3_POOL_ABI = [
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function liquidity() view returns (uint128)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
];

// Aerodrome Pool ABI (minimal)
const AERO_POOL_ABI = [
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    "function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function stable() view returns (bool)",
];

const V3_FACTORY_ABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const AERO_ROUTER_ABI = [
    "function defaultFactory() view returns (address)",
];

const AERO_FACTORY_ABI = [
    "function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)",
    "function getPair(address tokenA, address tokenB, bool stable) view returns (address pair)",
];

export interface PoolState {
    address: string;
    dex: "uniswapV3" | "pancakeV3" | "aerodrome";
    pair: string;
    token0: string;
    token1: string;
    // Uniswap V3 specific
    sqrtPriceX96?: bigint;
    tick?: number;
    liquidity?: bigint;
    fee?: number;
    // Aerodrome specific
    reserve0?: bigint;
    reserve1?: bigint;
    stable?: boolean;
    // Common
    lastUpdated: number;
}

export interface PriceUpdate {
    pair: string;
    pools: PoolState[];
    timestamp: number;
}

export class PoolMonitor extends EventEmitter {
    private provider: ethers.Provider;
    private wsProvider?: ethers.WebSocketProvider;
    private poolStates: Map<string, PoolState> = new Map();
    private pollingInterval?: NodeJS.Timeout;
    private isRunning = false;
    private log = createLogger("PoolMonitor");
    private uniV3Factory: ethers.Contract;
    private pancakeV3Factory: ethers.Contract;
    private aeroRouter: ethers.Contract;
    private aeroFactory?: ethers.Contract;

    constructor() {
        super();
        this.provider = createRpcProvider();
        this.uniV3Factory = new ethers.Contract(config.external.uniswapV3Factory, V3_FACTORY_ABI, this.provider);
        this.pancakeV3Factory = new ethers.Contract(config.external.pancakeswapV3Factory, V3_FACTORY_ABI, this.provider);
        this.aeroRouter = new ethers.Contract(config.external.aerodromeRouter, AERO_ROUTER_ABI, this.provider);
    }

    private async withRetry<T>(label: string, fn: () => Promise<T>, retries: number = 3, delayMs: number = 250): Promise<T> {
        let lastErr: unknown;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                if (i < retries - 1) {
                    await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
                }
            }
        }
        throw lastErr;
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        this.log.info("Starting pool monitoring...");

        // Initialize all pool states
        await this.initializePools();

        // Try WebSocket for real-time events
        const wsUrls = getWsUrls();
        if (wsUrls.length > 0) {
            try {
                this.wsProvider = createWsProvider(wsUrls[0]);
                await this.setupEventListeners();
                this.log.info("WebSocket listeners active", { wsUrl: wsUrls[0] });

                const ws: any = (this.wsProvider as any).websocket;
                const onClose = () => {
                    if (!this.isRunning) return;
                    this.log.warn("WebSocket closed; falling back to polling");
                    try {
                        this.wsProvider?.destroy();
                    } catch {
                        // ignore
                    }
                    this.wsProvider = undefined;
                    this.startPolling();
                };
                if (ws?.addEventListener) ws.addEventListener("close", onClose);
                else if (ws?.on) ws.on("close", onClose);
            } catch (err) {
                this.log.warn("WebSocket failed; falling back to polling");
                this.startPolling();
            }
        } else {
            // Fall back to polling
            this.startPolling();
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        if (this.wsProvider) {
            this.wsProvider.destroy();
        }
        this.log.info("Stopped");
    }

    getPoolStates(): Map<string, PoolState> {
        return this.poolStates;
    }

    getPoolsByPair(pairName: string): PoolState[] {
        return Array.from(this.poolStates.values()).filter((p) => p.pair === pairName);
    }

    private async initializePools(): Promise<void> {
        for (const pair of config.pairs) {
            // Initialize V3 pools (Uniswap V3 + PancakeSwap V3)
            for (const pool of pair.v3Pools || []) {
                try {
                    const dex = pool.dex ?? "uniswapV3";
                    const address = await this.resolveV3PoolAddress(dex, pair.token0, pair.token1, pool.fee, pool.address);
                    if (!address) continue;
                    try {
                        const state = await this.fetchV3State(dex, address, pair.name, pool.fee, pair.token0, pair.token1);
                        this.poolStates.set(address, state);
                        this.log.info("Initialized V3 pool", { pair: pair.name, dex, fee: pool.fee, address });
                    } catch (err) {
                        // Keep a placeholder so polling can retry later (RPC flakiness should not drop pools).
                        this.poolStates.set(address, {
                            address,
                            dex,
                            pair: pair.name,
                            token0: pair.token0,
                            token1: pair.token1,
                            fee: pool.fee,
                            lastUpdated: 0,
                        });
                        this.log.warn("Failed to init V3 pool", { pair: pair.name, dex, fee: pool.fee, address, err: String(err) });
                    }
                } catch (err) {
                    this.log.warn("Failed to init V3 pool", { pair: pair.name, fee: pool.fee, err: String(err) });
                }
            }

            // Initialize Aerodrome pools
            for (const pool of pair.aerodromePools) {
                try {
                    const address = await this.resolveAeroPoolAddress(pair.token0, pair.token1, pool.stable, pool.address);
                    if (!address) continue;
                    try {
                        const state = await this.fetchAeroState(address, pair.name, pool.stable, pair.token0, pair.token1);
                        this.poolStates.set(address, state);
                        this.log.info("Initialized Aerodrome pool", { pair: pair.name, address });
                    } catch (err) {
                        this.poolStates.set(address, {
                            address,
                            dex: "aerodrome",
                            pair: pair.name,
                            token0: pair.token0,
                            token1: pair.token1,
                            stable: pool.stable,
                            lastUpdated: 0,
                        });
                        this.log.warn("Failed to init Aero pool", { pair: pair.name, stable: pool.stable, address, err: String(err) });
                    }
                } catch (err) {
                    this.log.warn("Failed to init Aero pool", { pair: pair.name, stable: pool.stable, err: String(err) });
                }
            }
        }
    }

    private isV3Dex(dex: PoolState["dex"]): dex is "uniswapV3" | "pancakeV3" {
        return dex === "uniswapV3" || dex === "pancakeV3";
    }

    private getV3Factory(dex: "uniswapV3" | "pancakeV3"): ethers.Contract {
        return dex === "uniswapV3" ? this.uniV3Factory : this.pancakeV3Factory;
    }

    private async resolveV3PoolAddress(
        dex: "uniswapV3" | "pancakeV3",
        token0: string,
        token1: string,
        fee: number,
        configured?: string
    ): Promise<string | null> {
        if (configured && ethers.isAddress(configured) && configured !== ethers.ZeroAddress) return configured;
        try {
            const factory = this.getV3Factory(dex);
            const addr = await this.withRetry(`${dex}.factory.getPool`, () =>
                callWithFallback<string>((p) => (((factory.connect(p) as any) as any)).getPool(token0, token1, fee))
            );
            if (!ethers.isAddress(addr) || addr === ethers.ZeroAddress) {
                this.log.warn("V3 pool not found in factory", { dex, token0, token1, fee });
                return null;
            }
            return addr;
        } catch (err) {
            this.log.warn("V3 factory getPool failed", { dex, token0, token1, fee, err: String(err) });
            return null;
        }
    }

    private async resolveAeroPoolAddress(
        token0: string,
        token1: string,
        stable: boolean,
        configured?: string
    ): Promise<string | null> {
        if (configured && ethers.isAddress(configured) && configured !== ethers.ZeroAddress) return configured;
        try {
            if (!this.aeroFactory) {
                const factoryAddr = await this.withRetry("aeroRouter.defaultFactory", () =>
                    callWithFallback<string>((p) => ((this.aeroRouter.connect(p) as any) as any).defaultFactory())
                );
                this.aeroFactory = new ethers.Contract(factoryAddr, AERO_FACTORY_ABI, this.provider);
            }
            try {
                const addr = await this.withRetry("aeroFactory.getPool", () =>
                    callWithFallback<string>((p) => (((this.aeroFactory!.connect(p) as any) as any)).getPool(token0, token1, stable))
                );
                if (ethers.isAddress(addr) && addr !== ethers.ZeroAddress) return addr;
            } catch {
                // ignore; try getPair below
            }
            const addr2 = await this.withRetry("aeroFactory.getPair", () =>
                callWithFallback<string>((p) => (((this.aeroFactory!.connect(p) as any) as any)).getPair(token0, token1, stable))
            );
            if (!ethers.isAddress(addr2) || addr2 === ethers.ZeroAddress) {
                this.log.warn("Aerodrome pool not found in factory", { token0, token1, stable });
                return null;
            }
            return addr2;
        } catch (err) {
            this.log.warn("Aerodrome factory lookup failed", { token0, token1, stable, err: String(err) });
            return null;
        }
    }

    private async fetchV3State(
        dex: "uniswapV3" | "pancakeV3",
        address: string,
        pairName: string,
        fee: number,
        token0: string,
        token1: string
    ): Promise<PoolState> {
        const pool = new ethers.Contract(address, V3_POOL_ABI, this.provider) as any;
        const [slot0, liquidity] = await callWithFallback<any>((p) =>
            Promise.all([pool.connect(p).slot0(), pool.connect(p).liquidity()])
        );

        const minLiquidity = config.poolFilters?.minUniV3Liquidity ?? BigInt(0);
        if (minLiquidity > BigInt(0) && BigInt(liquidity) < minLiquidity) {
            throw new Error(`UniV3 liquidity below threshold`);
        }

        return {
            address,
            dex,
            pair: pairName,
            token0,
            token1,
            sqrtPriceX96: slot0.sqrtPriceX96,
            tick: slot0.tick,
            liquidity,
            fee,
            lastUpdated: Date.now(),
        };
    }

    private async fetchAeroState(
        address: string,
        pairName: string,
        stable: boolean,
        token0: string,
        token1: string
    ): Promise<PoolState> {
        const pool = new ethers.Contract(address, AERO_POOL_ABI, this.provider) as any;
        const reserves: any = await callWithFallback<any>((p) => pool.connect(p).getReserves());

        const minReserveBySymbol = config.poolFilters?.minReserveBySymbol ?? {};
        const token0Cfg = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === String(token0).toLowerCase()
        );
        const token1Cfg = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === String(token1).toLowerCase()
        );

        if (token0Cfg?.symbol && minReserveBySymbol[token0Cfg.symbol]) {
            const min0 = ethers.parseUnits(minReserveBySymbol[token0Cfg.symbol], token0Cfg.decimals);
            if (BigInt(reserves._reserve0) < min0) throw new Error("Aero reserve0 below threshold");
        }
        if (token1Cfg?.symbol && minReserveBySymbol[token1Cfg.symbol]) {
            const min1 = ethers.parseUnits(minReserveBySymbol[token1Cfg.symbol], token1Cfg.decimals);
            if (BigInt(reserves._reserve1) < min1) throw new Error("Aero reserve1 below threshold");
        }

        return {
            address,
            dex: "aerodrome",
            pair: pairName,
            token0,
            token1,
            reserve0: reserves._reserve0,
            reserve1: reserves._reserve1,
            stable,
            lastUpdated: Date.now(),
        };
    }

    private async setupEventListeners(): Promise<void> {
        if (!this.wsProvider) return;

        // Subscribe only to pools that were successfully initialized (resolved addresses).
        for (const state of Array.from(this.poolStates.values())) {
            if (this.isV3Dex(state.dex)) {
                const v3Dex = state.dex;
                const contract = new ethers.Contract(state.address, V3_POOL_ABI, this.wsProvider);
                contract.on("Swap", async () => {
                    try {
                        const next = await this.fetchV3State(
                            v3Dex,
                            state.address,
                            state.pair,
                            state.fee ?? 3000,
                            state.token0,
                            state.token1
                        );
                        this.poolStates.set(state.address, next);
                        this.emitPriceUpdate(state.pair);
                    } catch (err) {
                        this.log.warn("Error updating V3 pool", { address: state.address, dex: v3Dex, err: String(err) });
                    }
                });
            } else {
                const contract = new ethers.Contract(state.address, AERO_POOL_ABI, this.wsProvider);
                contract.on("Swap", async () => {
                    try {
                        const next = await this.fetchAeroState(
                            state.address,
                            state.pair,
                            !!state.stable,
                            state.token0,
                            state.token1
                        );
                        this.poolStates.set(state.address, next);
                        this.emitPriceUpdate(state.pair);
                    } catch (err) {
                        this.log.warn("Error updating Aero pool", { address: state.address, err: String(err) });
                    }
                });
            }
        }
    }

    private startPolling(): void {
        this.log.info("Polling enabled", { intervalMs: config.scanner.intervalMs });
        this.pollingInterval = setInterval(async () => {
            await this.pollAllPools();
        }, config.scanner.intervalMs);
    }

    private async pollAllPools(): Promise<void> {
        const snapshot = Array.from(this.poolStates.values());
        for (const prev of snapshot) {
            try {
                if (this.isV3Dex(prev.dex)) {
                    const next = await this.fetchV3State(
                        prev.dex,
                        prev.address,
                        prev.pair,
                        prev.fee ?? 3000,
                        prev.token0,
                        prev.token1
                    );
                    this.poolStates.set(prev.address, next);
                    if (prev.sqrtPriceX96 !== next.sqrtPriceX96) this.emitPriceUpdate(prev.pair);
                } else {
                    const next = await this.fetchAeroState(
                        prev.address,
                        prev.pair,
                        !!prev.stable,
                        prev.token0,
                        prev.token1
                    );
                    this.poolStates.set(prev.address, next);
                    if (prev.reserve0 !== next.reserve0 || prev.reserve1 !== next.reserve1) this.emitPriceUpdate(prev.pair);
                }
            } catch {
                // Continue on polling failures.
            }
        }
    }

    private emitPriceUpdate(pairName: string): void {
        const pools = this.getPoolsByPair(pairName);
        const update: PriceUpdate = {
            pair: pairName,
            pools,
            timestamp: Date.now(),
        };
        this.emit("priceUpdate", update);
    }
}
