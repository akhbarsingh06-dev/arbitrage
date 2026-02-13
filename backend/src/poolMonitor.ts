import { ethers } from "ethers";
import { config, PairConfig } from "./config";
import { EventEmitter } from "events";
import { createLogger } from "./logger";
import { callWithFallback, createRpcProvider, createWsProvider, getWsUrls } from "./providers";

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
    sqrtPriceX96?: bigint;
    tick?: number;
    liquidity?: bigint;
    fee?: number;
    reserve0?: bigint;
    reserve1?: bigint;
    stable?: boolean;
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
        await this.initializePools();

        const wsUrls = getWsUrls();
        if (wsUrls.length > 0) {
            try {
                this.wsProvider = createWsProvider(wsUrls[0]);
                await this.setupEventListeners();
                this.log.info("WebSocket listeners active", { wsUrl: wsUrls[0] });
            } catch (err) {
                this.log.warn("WebSocket failed; falling back to polling");
                this.startPolling();
            }
        } else {
            this.startPolling();
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.wsProvider) this.wsProvider.destroy();
        this.log.info("Stopped");
    }

    getPoolStates(): Map<string, PoolState> {
        return this.poolStates;
    }

    getPoolsByPair(pairName: string): PoolState[] {
        return Array.from(this.poolStates.values()).filter((p) => p.pair === pairName);
    }

    async addPair(pair: PairConfig): Promise<void> {
        this.log.info("Adding new pair dynamically", { pair: pair.name });
        await this.initializeSinglePair(pair);
        if (this.wsProvider) {
            const pools = this.getPoolsByPair(pair.name);
            for (const state of pools) {
                await this.setupPoolListener(state);
            }
        }
    }

    private async initializePools(): Promise<void> {
        for (const pair of config.pairs) {
            await this.initializeSinglePair(pair);
        }
    }

    private async initializeSinglePair(pair: PairConfig): Promise<void> {
        // V3 Pools
        for (const pool of pair.v3Pools || []) {
            try {
                const dex = pool.dex ?? "uniswapV3";
                const address = await this.resolveV3PoolAddress(dex, pair.token0, pair.token1, pool.fee, pool.address);
                if (!address) continue;
                try {
                    const state = await this.fetchV3State(dex, address, pair.name, pool.fee, pair.token0, pair.token1);
                    this.poolStates.set(address, state);
                } catch {
                    this.poolStates.set(address, { address, dex, pair: pair.name, token0: pair.token0, token1: pair.token1, fee: pool.fee, lastUpdated: 0 });
                }
            } catch (err) {
                this.log.warn("Failed to init V3 pool", { pair: pair.name, fee: pool.fee, err: String(err) });
            }
        }

        // Aero Pools
        for (const pool of pair.aerodromePools || []) {
            try {
                const address = await this.resolveAeroPoolAddress(pair.token0, pair.token1, pool.stable, pool.address);
                if (!address) continue;
                try {
                    const state = await this.fetchAeroState(address, pair.name, pool.stable, pair.token0, pair.token1);
                    this.poolStates.set(address, state);
                } catch {
                    this.poolStates.set(address, { address, dex: "aerodrome", pair: pair.name, token0: pair.token0, token1: pair.token1, stable: pool.stable, lastUpdated: 0 });
                }
            } catch (err) {
                this.log.warn("Failed to init Aero pool", { pair: pair.name, stable: pool.stable, err: String(err) });
            }
        }
    }

    private async resolveV3PoolAddress(dex: "uniswapV3" | "pancakeV3", t0: string, t1: string, fee: number, cfg?: string): Promise<string | null> {
        if (cfg && ethers.isAddress(cfg) && cfg !== ethers.ZeroAddress) return cfg;
        try {
            const factory = dex === "uniswapV3" ? this.uniV3Factory : this.pancakeV3Factory;
            const addr = await this.withRetry(`${dex}.factory`, () => callWithFallback<string>((p) => (factory.connect(p) as any).getPool(t0, t1, fee)));
            return (addr && addr !== ethers.ZeroAddress) ? addr : null;
        } catch { return null; }
    }

    private async resolveAeroPoolAddress(t0: string, t1: string, stable: boolean, cfg?: string): Promise<string | null> {
        if (cfg && ethers.isAddress(cfg) && cfg !== ethers.ZeroAddress) return cfg;
        try {
            if (!this.aeroFactory) {
                const addr = await this.withRetry("aeroRouter.defaultFactory", () => callWithFallback<string>((p) => (this.aeroRouter.connect(p) as any).defaultFactory()));
                this.aeroFactory = new ethers.Contract(addr, AERO_FACTORY_ABI, this.provider);
            }
            const addr = await this.withRetry("aeroFactory.getPool", () => callWithFallback<string>((p) => (this.aeroFactory!.connect(p) as any).getPool(t0, t1, stable)));
            return (addr && addr !== ethers.ZeroAddress) ? addr : null;
        } catch { return null; }
    }

    private async fetchV3State(dex: "uniswapV3" | "pancakeV3", address: string, pair: string, fee: number, t0: string, t1: string): Promise<PoolState> {
        const pool = new ethers.Contract(address, V3_POOL_ABI, this.provider);
        const [slot0, liquidity] = await callWithFallback<any>((p) => Promise.all([
            (pool.connect(p) as any).slot0(),
            (pool.connect(p) as any).liquidity()
        ]));
        return { address, dex, pair, token0: t0, token1: t1, sqrtPriceX96: slot0.sqrtPriceX96, tick: slot0.tick, liquidity, fee, lastUpdated: Date.now() };
    }

    private async fetchAeroState(address: string, pair: string, stable: boolean, t0: string, t1: string): Promise<PoolState> {
        const pool = new ethers.Contract(address, AERO_POOL_ABI, this.provider);
        const res: any = await callWithFallback<any>((p) => (pool.connect(p) as any).getReserves());
        return { address, dex: "aerodrome", pair, token0: t0, token1: t1, reserve0: res._reserve0, reserve1: res._reserve1, stable, lastUpdated: Date.now() };
    }

    private async setupEventListeners() {
        if (!this.wsProvider) return;
        for (const state of Array.from(this.poolStates.values())) {
            await this.setupPoolListener(state);
        }
    }

    private async setupPoolListener(state: PoolState) {
        if (!this.wsProvider) return;
        const contract = new ethers.Contract(state.address, state.dex === "aerodrome" ? AERO_POOL_ABI : V3_POOL_ABI, this.wsProvider);
        contract.on("Swap", async () => {
            try {
                const next = state.dex === "aerodrome"
                    ? await this.fetchAeroState(state.address, state.pair, !!state.stable, state.token0, state.token1)
                    : await this.fetchV3State(state.dex as any, state.address, state.pair, state.fee!, state.token0, state.token1);
                this.poolStates.set(state.address, next);
                this.emitPriceUpdate(state.pair);
            } catch { }
        });
    }

    private startPolling() {
        this.pollingInterval = setInterval(() => this.pollAllPools(), config.scanner.intervalMs);
    }

    private async pollAllPools() {
        for (const prev of Array.from(this.poolStates.values())) {
            try {
                const next = prev.dex === "aerodrome"
                    ? await this.fetchAeroState(prev.address, prev.pair, !!prev.stable, prev.token0, prev.token1)
                    : await this.fetchV3State(prev.dex as any, prev.address, prev.pair, prev.fee!, prev.token0, prev.token1);
                this.poolStates.set(prev.address, next);
                this.emitPriceUpdate(prev.pair);
            } catch { }
        }
    }

    private emitPriceUpdate(pair: string) {
        const pools = this.getPoolsByPair(pair);
        this.emit("priceUpdate", { pair, pools, timestamp: Date.now() });
    }
}
