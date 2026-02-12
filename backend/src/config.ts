import dotenv from "dotenv";
import path from "path";

// Load env from either repo root (`../.env`) or package root (`.env`), depending on cwd
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

function parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

type ExtraToken = { address: string; decimals: number; symbol: string };
type V3DexKey = "uniswapV3" | "pancakeV3";
type ExtraV3Pool = { address?: string; fee: number; dex?: V3DexKey };
type ExtraPair = {
    name: string;
    token0: string;
    token1: string;
    // Backwards compatible: if `v3Pools` is not provided, `uniV3Pools` is treated as Uniswap V3.
    uniV3Pools?: Array<{ address?: string; fee: number }>;
    v3Pools?: ExtraV3Pool[];
    aerodromePools: Array<{ address?: string; stable: boolean }>;
};

const extraTokens = parseJson<ExtraToken[]>(process.env.EXTRA_TOKENS_JSON, []);
const extraPairs = parseJson<ExtraPair[]>(process.env.EXTRA_PAIRS_JSON, []);

const baseTokens = {
    WETH: {
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        symbol: "WETH",
    },
    USDC: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        symbol: "USDC",
    },
    cbETH: {
        address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
        decimals: 18,
        symbol: "cbETH",
    },
    DAI: {
        // Canonical DAI on Base
        address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        decimals: 18,
        symbol: "DAI",
    },
    USDbC: {
        // Bridged USDC ("USDbC") widely used in Base liquidity.
        address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        decimals: 6,
        symbol: "USDbC",
    },
    cbBTC: {
        // Coinbase Wrapped BTC
        address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        decimals: 8,
        symbol: "cbBTC",
    },
} as const;

const tokens: Record<string, { address: string; decimals: number; symbol: string }> = {
    ...baseTokens,
};

for (const t of extraTokens) {
    if (!t?.address || !t?.symbol) continue;
    tokens[t.symbol] = { address: t.address, decimals: Number(t.decimals), symbol: t.symbol };
}

const basePairs: ExtraPair[] = [
    {
        name: "WETH/USDC",
        token0: baseTokens.WETH.address,
        token1: baseTokens.USDC.address,
        v3Pools: [
            // Uniswap V3 (Base)
            { dex: "uniswapV3", fee: 500 },   // 0.05%
            { dex: "uniswapV3", fee: 3000 },  // 0.3%
            // PancakeSwap V3 (Base) — additional v3 venue
            { dex: "pancakeV3", fee: 500 },   // 0.05%
            { dex: "pancakeV3", fee: 2500 },  // 0.25% (common on Pancake v3)
        ],
        aerodromePools: [
            { stable: false },
        ],
    },
    {
        name: "cbETH/WETH",
        token0: baseTokens.cbETH.address,
        token1: baseTokens.WETH.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 500 },
            { dex: "pancakeV3", fee: 500 },
        ],
        aerodromePools: [
            { stable: false },
        ],
    },
    {
        // Keep token1 as USDC for cleaner profit/gas denomination in early phases.
        name: "DAI/USDC",
        token0: baseTokens.DAI.address,
        token1: baseTokens.USDC.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 100 },  // 0.01%
            { dex: "uniswapV3", fee: 500 },  // 0.05%
            { dex: "pancakeV3", fee: 100 },
            { dex: "pancakeV3", fee: 500 },
        ],
        aerodromePools: [
            { stable: true },
            { stable: false },
        ],
    },
    {
        name: "USDbC/USDC",
        token0: baseTokens.USDbC.address,
        token1: baseTokens.USDC.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 100 },
            { dex: "uniswapV3", fee: 500 },
            { dex: "pancakeV3", fee: 100 },
            { dex: "pancakeV3", fee: 500 },
        ],
        aerodromePools: [
            { stable: true },
            { stable: false },
        ],
    },
    {
        name: "DAI/WETH",
        token0: baseTokens.DAI.address,
        token1: baseTokens.WETH.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 3000 },
            { dex: "pancakeV3", fee: 2500 },
        ],
        aerodromePools: [
            { stable: false },
        ],
    },
    {
        name: "cbBTC/WETH",
        token0: baseTokens.cbBTC.address,
        token1: baseTokens.WETH.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 3000 },
            { dex: "pancakeV3", fee: 2500 },
        ],
        aerodromePools: [
            { stable: false },
        ],
    },
    {
        name: "cbBTC/USDC",
        token0: baseTokens.cbBTC.address,
        token1: baseTokens.USDC.address,
        v3Pools: [
            { dex: "uniswapV3", fee: 3000 },
            { dex: "pancakeV3", fee: 2500 },
        ],
        aerodromePools: [
            { stable: false },
        ],
    },
];

function normalizePair(p: ExtraPair): ExtraPair & { v3Pools: ExtraV3Pool[] } {
    const v3Pools: ExtraV3Pool[] =
        (p.v3Pools && Array.isArray(p.v3Pools) ? p.v3Pools : []).map((x) => ({
            address: x.address,
            fee: Number(x.fee),
            dex: (x.dex ?? "uniswapV3") as V3DexKey,
        }));

    if (v3Pools.length === 0 && p.uniV3Pools && Array.isArray(p.uniV3Pools)) {
        for (const x of p.uniV3Pools) {
            v3Pools.push({ address: x.address, fee: Number(x.fee), dex: "uniswapV3" });
        }
    }

    return {
        ...p,
        v3Pools,
        aerodromePools: Array.isArray(p.aerodromePools) ? p.aerodromePools : [],
    };
}

// ═══════════════════════════════════════════════
//  BASE ARBITRAGE PROTOCOL — Backend Configuration
// ═══════════════════════════════════════════════

export const config = {
    // Network
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    wsUrl: process.env.BASE_WS_URL || "",
    rpcUrls: (process.env.BASE_RPC_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    wsUrls: (process.env.BASE_WS_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    chainId: 8453,

    // Contract Addresses (populated after deployment)
    contracts: {
        flashLoanExecutor: process.env.FLASH_LOAN_EXECUTOR_ADDRESS || "",
        arbitrageRouter: process.env.ARBITRAGE_ROUTER_ADDRESS || "",
        treasury: process.env.TREASURY_ADDRESS || "",
        uniswapV3Adapter: process.env.UNISWAP_V3_ADAPTER_ADDRESS || "",
        pancakeV3Adapter: process.env.PANCAKESWAP_V3_ADAPTER_ADDRESS || "",
        aerodromeAdapter: process.env.AERODROME_ADAPTER_ADDRESS || "",
    },

    // External Protocol Addresses (Base Mainnet)
    external: {
        aavePool: process.env.AAVE_POOL || "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        uniswapV3Router: process.env.UNISWAP_V3_ROUTER || "0x2626664c2603336E57B271c5C0b26F421741e481",
        uniswapV3Factory: process.env.UNISWAP_V3_FACTORY || "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        // Prefer Uniswap's official View Quoter on Base (returns normally; avoids revert-data issues on public RPCs).
        uniswapV3Quoter: process.env.UNISWAP_V3_QUOTER || "0x222ca98f00ed15b1fae10b61c277703a194cf5d2",
        pancakeswapV3Router: process.env.PANCAKESWAP_V3_ROUTER || "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
        pancakeswapV3Factory: process.env.PANCAKESWAP_V3_FACTORY || "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        pancakeswapV3Quoter: process.env.PANCAKESWAP_V3_QUOTER || "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
        aerodromeRouter: process.env.AERODROME_ROUTER || "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    },

    // Token Addresses (Base Mainnet + optional extras via EXTRA_TOKENS_JSON)
    tokens,

    // Monitored Token Pairs + Pools
    pairs: [...basePairs, ...extraPairs].map(normalizePair),

    // Pool filters (optional): set to only monitor high-liquidity pools
    poolFilters: {
        minUniV3Liquidity: BigInt(process.env.MIN_UNIV3_LIQUIDITY || "0"),
        minReserveBySymbol: {
            USDC: process.env.MIN_RESERVE_USDC || "",
            WETH: process.env.MIN_RESERVE_WETH || "",
            cbETH: process.env.MIN_RESERVE_CBETH || "",
            DAI: process.env.MIN_RESERVE_DAI || "",
            USDbC: process.env.MIN_RESERVE_USDBC || "",
            cbBTC: process.env.MIN_RESERVE_CBBTC || "",
        } as Record<string, string>,
    },

    // Relayer
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || "",
    relayer: {
        // Keep low for Base since gas is cheap; prevents relayer from attempting execution with near-zero balance.
        minBalanceEth: process.env.MIN_RELAYER_BALANCE_ETH || "0.001",
    },

    // Scanner Settings
    scanner: {
        intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "5000"),
        minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "1.0"),
        profitBufferUsd: parseFloat(process.env.PROFIT_BUFFER_USD || "0.25"),
        maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI || "50"),
        defaultSlippageBps: 50, // 0.5%
        minSpreadPercent: parseFloat(process.env.MIN_SPREAD_PERCENT || "0.05"),
    },

    // Server
    server: {
        port: parseInt(process.env.PORT || "3001"),
        host: process.env.HOST || "127.0.0.1",
        corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    },

    // Protocol
    protocol: {
        feePercent: 15,
        feeBps: 1500,
        bpsDenominator: 10000,
    },
};

export type TokenConfig = typeof config.tokens.WETH;
export type PairConfig = typeof config.pairs[0];
