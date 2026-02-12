import type { Hex } from "viem";

export type SwapStep = {
  adapter: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountIn: bigint;
  minAmountOut: bigint;
  data: Hex;
};

export type SimulationResult = {
  id: string;
  pair: string;
  buyDex: string;
  sellDex: string;
  inputToken: string;
  userProfit: string;
  userProfitRaw: string;
  protocolFee: string;
  protocolFeeRaw: string;
  grossProfit: string;
  grossProfitRaw: string;
  gasEstimate: string;
  gasCostEth: string;
  gasCostUsd: string;
  netProfitable: boolean;
  executionReady: boolean;
  missingAdapters: string[];
  spreadPercent: number;
  timestamp: number;
  route: {
    flashLoanToken: string;
    flashLoanAmount: string;
    steps: Array<{
      adapter: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      minAmountOut: string;
      data: string;
      dex: string;
    }>;
  };
};

export type OpportunityResponse = {
  opportunities: SimulationResult[];
  count: number;
  timestamp: number;
};

export type SpreadsResponse = {
  pairs: Array<{
    pair: string;
    pools: Array<{
      poolAddress: string;
      dex: string;
      price: number;
      inversePrice: number;
      liquidity: string;
      feeBps: number;
      feeTier?: number;
      stable?: boolean;
    }>;
    spreads: Array<{
      pair: string;
      buyPool: {
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      };
      sellPool: {
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      };
      spreadPercent: number;
      estimatedProfit: number;
      direction: string;
      timestamp: number;
    }>;
    topRaw: Array<{
      a: {
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      };
      b: {
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      };
      rawSpreadPercent: number;
      feePercent: number;
      netSpreadPercent: number;
      buyDex: string;
      sellDex: string;
    }>;
  }>;
  timestamp: number;
};

export type HealthResponse = {
  status: "ok";
  uptime: number;
  poolsMonitored: number;
  activeOpportunities: number;
  executionConfigured: boolean;
  missingEnv: string[];
  optionalMissingEnv?: string[];
};

export type AnalyticsResponse = {
  protocol: {
    totalExecutions: string | number;
    totalProfitGenerated: string;
    totalOpportunitiesFound: number;
    feePercent: number;
    totalsByAsset: Array<{
      asset: string;
      symbol: string;
      decimals: number;
      totalVolumeRaw: string;
      totalVolume: string;
      totalVolumeUsd: number | null;
      totalUserProfitRaw: string;
      totalUserProfit: string;
      totalUserProfitUsd: number | null;
      totalProtocolRevenueRaw: string;
      totalProtocolRevenue: string;
      totalProtocolRevenueUsd: number | null;
      totalProfitGeneratedRaw: string;
      totalProfitGenerated: string;
      totalGasRefundedRaw: string;
      totalGasRefunded: string;
    }>;
    totalsUsd: {
      totalArbitrageVolumeUsd: number;
      totalUserProfitUsd: number;
      totalProtocolRevenueUsd: number;
      ethPriceUsd: number;
    };
    success: {
      attempts: number;
      successes: number;
      successRate: number; // 0..1
      inefficienciesCorrected: number;
    };
  };
  pools: {
    monitored: number;
    pairs: Array<{
      pair: string;
      prices: Array<{
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      }>;
    }>;
    dexOverview: {
      totalPools: number;
      uniswapV3Pools: number;
      pancakeV3Pools: number;
      aerodromePools: number;
    };
    dexLiquidity: Array<{
      address: string;
      dex: "uniswapV3" | "pancakeV3" | "aerodrome";
      pair: string;
      token0: { address: string; symbol: string; decimals: number };
      token1: { address: string; symbol: string; decimals: number };
      uniV3: null | { liquidity: string; fee: number; tick: number };
      pancakeV3: null | { liquidity: string; fee: number; tick: number };
      aerodrome:
        | null
        | {
            reserve0: string;
            reserve1: string;
            stable: boolean;
            reserve0Human: string | null;
            reserve1Human: string | null;
          };
      lastUpdated: number;
    }>;
  };
  relayer: {
    address: string;
    executionCount: number;
  };
  timestamp: number;
};

export type ExecutionResult = {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  error?: string;
  simulationId: string;
  timestamp: number;
};

export type ExecutionIntent = {
  user: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  routeHash: Hex;
  minNetProfit: bigint;
  deadline: bigint;
  refundRecipient: `0x${string}`;
  maxGasRefund: bigint;
  nonce: bigint;
};
