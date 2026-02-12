import { ethers } from "ethers";
import { config } from "./config";
import { callWithFallback, createRpcProvider } from "./providers";
import { withRetry } from "./retry";

const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const AERO_ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
    "function defaultFactory() view returns (address)",
];

const EXECUTOR_ABI = [
    "function executeArbitrageWithIntent((address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce) intent, (address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[] steps, bytes signature) external",
];

const AAVE_POOL_ABI = [
    "function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)",
];

export type Step = {
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    data: string;
};

export type Intent = {
    user: string;
    asset: string;
    amount: string;
    routeHash: string;
    minNetProfit: string;
    deadline: string;
    refundRecipient: string;
    maxGasRefund: string;
    nonce: string;
};

export type VerificationResult = {
    ok: boolean;
    reason?: string;
    amountOwed?: bigint;
    amountOut?: bigint;
    grossProfit?: bigint;
    gasRefund?: bigint;
    netProfitAfterRefund?: bigint;
    protocolFee?: bigint;
    userProfit?: bigint;
    gasEstimate?: bigint;
};

function lower(x: string): string {
    return x.toLowerCase();
}

function isUniswapAdapter(adapter: string): boolean {
    return !!config.contracts.uniswapV3Adapter && lower(adapter) === lower(config.contracts.uniswapV3Adapter);
}

function isPancakeAdapter(adapter: string): boolean {
    return !!config.contracts.pancakeV3Adapter && lower(adapter) === lower(config.contracts.pancakeV3Adapter);
}

function isAerodromeAdapter(adapter: string): boolean {
    return !!config.contracts.aerodromeAdapter && lower(adapter) === lower(config.contracts.aerodromeAdapter);
}

function decodeUint24(data: string): number {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return Number(coder.decode(["uint24"], data)[0]);
}

function decodeBool(data: string): boolean {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return Boolean(coder.decode(["bool"], data)[0]);
}

export class RouteVerifier {
    private provider: ethers.Provider;
    private uniQuoter: any;
    private pancakeQuoter: any;
    private aeroRouter: ethers.Contract;
    private executor?: ethers.Contract;
    private aeroFactory?: string;

    constructor() {
        this.provider = createRpcProvider();
        this.uniQuoter = new ethers.Contract(config.external.uniswapV3Quoter, QUOTER_ABI, this.provider) as any;
        this.pancakeQuoter = new ethers.Contract(config.external.pancakeswapV3Quoter, QUOTER_ABI, this.provider) as any;
        this.aeroRouter = new ethers.Contract(config.external.aerodromeRouter, AERO_ROUTER_ABI, this.provider);
        if (config.contracts.flashLoanExecutor) {
            this.executor = new ethers.Contract(config.contracts.flashLoanExecutor, EXECUTOR_ABI, this.provider);
        }
    }

    private async getAeroFactory(): Promise<string> {
        if (this.aeroFactory) return this.aeroFactory;
        const f = await withRetry(() => this.aeroRouter.defaultFactory(), {
            retries: 2,
            baseDelayMs: 200,
            maxDelayMs: 1500,
            label: "aero.defaultFactory",
        });
        this.aeroFactory = String(f);
        return this.aeroFactory;
    }

    private async quoteStep(step: Step, amountIn: bigint): Promise<bigint> {
        if (isUniswapAdapter(step.adapter)) {
            const fee = decodeUint24(step.data);
            const result = await withRetry(
                () =>
                    callWithFallback((p) =>
                        this.uniQuoter.connect(p).quoteExactInputSingle.staticCall({
                            tokenIn: step.tokenIn,
                            tokenOut: step.tokenOut,
                            amountIn,
                            fee,
                            sqrtPriceLimitX96: 0,
                        })
                    ),
                { retries: 2, baseDelayMs: 250, maxDelayMs: 2000, label: "quote.univ3" }
            );
            return (result as any).amountOut as bigint;
        }

        if (isPancakeAdapter(step.adapter)) {
            const fee = decodeUint24(step.data);
            const result = await withRetry(
                () =>
                    callWithFallback((p) =>
                        this.pancakeQuoter.connect(p).quoteExactInputSingle.staticCall({
                            tokenIn: step.tokenIn,
                            tokenOut: step.tokenOut,
                            amountIn,
                            fee,
                            sqrtPriceLimitX96: 0,
                        })
                    ),
                { retries: 2, baseDelayMs: 250, maxDelayMs: 2000, label: "quote.pancakev3" }
            );
            return (result as any).amountOut as bigint;
        }

        if (isAerodromeAdapter(step.adapter)) {
            const stable = decodeBool(step.data);
            const factory = await this.getAeroFactory();
            const routes = [
                {
                    from: step.tokenIn,
                    to: step.tokenOut,
                    stable,
                    factory,
                },
            ];
            const amounts = await withRetry(() => this.aeroRouter.getAmountsOut(amountIn, routes), {
                retries: 2,
                baseDelayMs: 250,
                maxDelayMs: 2000,
                label: "quote.aero",
            });
            return amounts[amounts.length - 1] as bigint;
        }

        throw new Error("Unknown adapter");
    }

    private async getAavePremiumBps(): Promise<bigint> {
        const pool = new ethers.Contract(config.external.aavePool, AAVE_POOL_ABI, this.provider);
        try {
            const p = await withRetry(() => pool.FLASHLOAN_PREMIUM_TOTAL(), {
                retries: 2,
                baseDelayMs: 250,
                maxDelayMs: 2000,
                label: "aave.premium",
            });
            return BigInt(p);
        } catch {
            return 5n; // fallback to 0.05%
        }
    }

    async verifyIntent(intent: Intent, steps: Step[], signature: string): Promise<VerificationResult> {
        try {
            if (!steps || steps.length < 2) return { ok: false, reason: "need >=2 steps" };
            if (lower(steps[0].tokenIn) !== lower(intent.asset)) return { ok: false, reason: "route start mismatch" };
            if (lower(steps[steps.length - 1].tokenOut) !== lower(intent.asset))
                return { ok: false, reason: "route end mismatch" };

            let amount = BigInt(intent.amount);
            if (amount <= 0n) return { ok: false, reason: "amount=0" };

            // Quote the route
            let current = amount;
            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                const stepIn = BigInt(s.amountIn || "0");
                const useAmountIn = stepIn > 0n ? stepIn : current;
                const out = await this.quoteStep(s, useAmountIn);
                const minOut = BigInt(s.minAmountOut);
                if (out < minOut) return { ok: false, reason: "minAmountOut breached in quote" };
                current = out;
            }

            const premiumBps = await this.getAavePremiumBps();
            const premium = (amount * premiumBps) / 10000n;
            const amountOwed = amount + premium;

            if (current <= amountOwed) return { ok: false, reason: "unprofitable before fees" };
            const grossProfit = current - amountOwed;

            const maxRefund = BigInt(intent.maxGasRefund || "0");
            const gasRefund = maxRefund > 0n ? (grossProfit >= maxRefund ? maxRefund : grossProfit) : 0n;
            const netProfitAfterRefund = grossProfit - gasRefund;
            if (netProfitAfterRefund <= 0n) return { ok: false, reason: "netProfit<=0" };

            const protocolFee = (netProfitAfterRefund * 1500n) / 10000n;
            const userProfit = netProfitAfterRefund - protocolFee;
            if (userProfit <= 0n) return { ok: false, reason: "userProfit<=0" };

            const minNet = BigInt(intent.minNetProfit || "0");
            if (userProfit < minNet) return { ok: false, reason: "below minNetProfit" };

            // Optional gas estimation validation (requires deployed executor + correct RELAYER_ROLE; best-effort)
            let gasEstimate: bigint | undefined;
            if (this.executor) {
                try {
                    gasEstimate = await withRetry(
                        async () => {
                            const g = await this.executor!.executeArbitrageWithIntent.estimateGas(intent, steps, signature);
                            return BigInt(g);
                        },
                        { retries: 1, baseDelayMs: 250, maxDelayMs: 1000, label: "estimateGas" }
                    );
                } catch {
                    // ignore
                }
            }

            return {
                ok: true,
                amountOwed,
                amountOut: current,
                grossProfit,
                gasRefund,
                netProfitAfterRefund,
                protocolFee,
                userProfit,
                gasEstimate,
            };
        } catch (err: any) {
            return { ok: false, reason: err?.message || String(err) };
        }
    }
}
