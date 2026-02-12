import { ethers } from "ethers";
import { config } from "./config";
import { SimulationResult } from "./simulator";
import { createLogger } from "./logger";
import { NonceManager } from "./nonceManager";
import { withRetry } from "./retry";
import { createTxProvider } from "./providers";

// ═══════════════════════════════════════════════
//  Relayer — Executes arbitrage transactions
// ═══════════════════════════════════════════════

// FlashLoanExecutor ABI (minimal)
const EXECUTOR_ABI = [
    "function executeArbitrage(address asset, uint256 amount, (address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] steps, uint256 minNetProfit, address user, uint256 deadline) external",
    "function executeArbitrageWithIntent((address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce) intent, (address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] steps, bytes signature) external",
    "function totalExecutions() view returns (uint256)",
    "function totalProfitGenerated() view returns (uint256)",
    "function totalProtocolFees() view returns (uint256)",
    "function totalUserProfit() view returns (uint256)",
    "function totalGasRefunded() view returns (uint256)",
    "function getTrackedAssets() view returns (address[])",
    "function totalArbitrageVolumeByAsset(address) view returns (uint256)",
    "function totalProfitGeneratedByAsset(address) view returns (uint256)",
    "function totalProtocolFeesByAsset(address) view returns (uint256)",
    "function totalUserProfitByAsset(address) view returns (uint256)",
    "function totalGasRefundedByAsset(address) view returns (uint256)",
];

export interface ExecutionIntent {
    user: string;
    asset: string;
    amount: string;
    routeHash: string;
    minNetProfit: string;
    deadline: string;
    refundRecipient: string;
    maxGasRefund: string;
    nonce: string;
}

export interface ExecutionResult {
    success: boolean;
    txHash?: string;
    gasUsed?: string;
    effectiveGasPrice?: string;
    error?: string;
    simulationId: string;
    timestamp: number;
}

export type AssetTotals = {
    asset: string;
    totalVolume: string;
    totalProfitGenerated: string;
    totalProtocolFees: string;
    totalUserProfit: string;
    totalGasRefunded: string;
};

export class Relayer {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet | ethers.HDNodeWallet;
    private executor?: ethers.Contract;
    private executionHistory: ExecutionResult[] = [];
    private nonces: NonceManager;
    private log = createLogger("Relayer");

    constructor() {
        this.provider = createTxProvider();

        if (!config.relayerPrivateKey) {
            this.log.warn("No relayer private key configured");
            this.wallet = ethers.Wallet.createRandom().connect(this.provider);
        } else {
            this.wallet = new ethers.Wallet(config.relayerPrivateKey, this.provider);
        }

        if (ethers.isAddress(config.contracts.flashLoanExecutor) && config.contracts.flashLoanExecutor !== ethers.ZeroAddress) {
            this.executor = new ethers.Contract(config.contracts.flashLoanExecutor, EXECUTOR_ABI, this.wallet);
        } else {
            this.log.warn("Execution not configured (missing FLASH_LOAN_EXECUTOR_ADDRESS)");
            this.executor = undefined;
        }
        this.nonces = new NonceManager(this.provider, this.wallet.address);
    }

    private requireExecutor(): ethers.Contract {
        if (!this.executor) throw new Error("Relayer: execution not configured");
        return this.executor;
    }

    /**
     * Execute an arbitrage opportunity on-chain
     */
    async execute(
        simulation: SimulationResult,
        userAddress: string
    ): Promise<ExecutionResult> {
        try {
            this.log.info("Executing arbitrage", { simulationId: simulation.id, userAddress });
            const executor = this.requireExecutor();

            // Pre-flight checks
            await this.preFlight(simulation);

            // Build contract call parameters
            const steps = simulation.route.steps.map((step) => ({
                adapter: step.adapter,
                tokenIn: step.tokenIn,
                tokenOut: step.tokenOut,
                amountIn: step.amountIn,
                minAmountOut: step.minAmountOut,
                data: step.data,
            }));

            const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min deadline

            // Apply slippage to minNetProfit
            const minNetProfit = this.applySlippage(
                BigInt(simulation.userProfitRaw),
                config.scanner.defaultSlippageBps
            );

            // Estimate gas first
            const gasEstimate = await executor.executeArbitrage.estimateGas(
                simulation.route.flashLoanToken,
                simulation.route.flashLoanAmount,
                steps,
                minNetProfit.toString(),
                userAddress,
                deadline
            );

            // Add 20% buffer to gas estimate
            const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

            const nonce = await this.nonces.getNonce();
            const tx = await this.sendWithRetry(() =>
                executor.executeArbitrage(
                    simulation.route.flashLoanToken,
                    simulation.route.flashLoanAmount,
                    steps,
                    minNetProfit.toString(),
                    userAddress,
                    deadline,
                    { gasLimit, nonce }
                )
            );
            this.nonces.markUsed(nonce);

            this.log.info("Transaction submitted", { hash: tx.hash, nonce });

            // Wait for confirmation
            const receipt = await tx.wait(1);

            const result: ExecutionResult = {
                success: receipt.status === 1,
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                effectiveGasPrice: receipt.gasPrice?.toString(),
                simulationId: simulation.id,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.info("Execution mined", { success: result.success, hash: result.txHash });

            return result;
        } catch (err: any) {
            const result: ExecutionResult = {
                success: false,
                error: err.message || "Unknown error",
                simulationId: simulation.id,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.error("Execution failed", { err: err?.message || String(err) });

            return result;
        }
    }

    /**
     * Execute an arbitrage using a user-signed intent (hybrid execution).
     */
    async executeWithIntent(
        intent: ExecutionIntent,
        steps: SimulationResult["route"]["steps"],
        signature: string
    ): Promise<ExecutionResult> {
        try {
            this.log.info("Executing signed intent", { user: intent.user });
            const executor = this.requireExecutor();

            if (!ethers.isAddress(intent.user) || !ethers.isAddress(intent.asset)) {
                throw new Error("Invalid intent addresses");
            }

            const nonce = await this.nonces.getNonce();
            const tx = await this.sendWithRetry(() =>
                executor.executeArbitrageWithIntent(
                    {
                        user: intent.user,
                        asset: intent.asset,
                        amount: intent.amount,
                        routeHash: intent.routeHash,
                        minNetProfit: intent.minNetProfit,
                        deadline: intent.deadline,
                        refundRecipient: intent.refundRecipient,
                        maxGasRefund: intent.maxGasRefund,
                        nonce: intent.nonce,
                    },
                    steps.map((s) => ({
                        adapter: s.adapter,
                        tokenIn: s.tokenIn,
                        tokenOut: s.tokenOut,
                        amountIn: s.amountIn,
                        minAmountOut: s.minAmountOut,
                        data: s.data,
                    })),
                    signature,
                    { nonce }
                )
            );
            this.nonces.markUsed(nonce);

            this.log.info("Intent transaction submitted", { hash: tx.hash, nonce });

            const receipt = await tx.wait(1);
            const result: ExecutionResult = {
                success: receipt.status === 1,
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                effectiveGasPrice: receipt.gasPrice?.toString(),
                simulationId: `intent-${intent.user}-${Date.now()}`,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            return result;
        } catch (err: any) {
            const result: ExecutionResult = {
                success: false,
                error: err.message || "Unknown error",
                simulationId: `intent-${intent.user || "unknown"}-${Date.now()}`,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.error("Intent execution failed", { err: err?.message || String(err) });
            return result;
        }
    }

    /**
     * Pre-flight checks before executing
     */
    private async preFlight(simulation: SimulationResult): Promise<void> {
        // Check gas price
        const feeData = await withRetry(() => this.provider.getFeeData(), {
            retries: 2,
            baseDelayMs: 250,
            maxDelayMs: 1500,
            label: "getFeeData",
        });
        const gasPrice = feeData.gasPrice;
        if (gasPrice && gasPrice > ethers.parseUnits(String(config.scanner.maxGasPriceGwei), "gwei")) {
            throw new Error(`Gas price too high: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
        }

        // Check if still profitable
        if (!simulation.netProfitable) {
            throw new Error("Simulation shows trade is not profitable");
        }

        // Check relayer balance for gas
        const balance = await withRetry(() => this.provider.getBalance(this.wallet.address), {
            retries: 2,
            baseDelayMs: 250,
            maxDelayMs: 1500,
            label: "getBalance",
        });
        const minBal = ethers.parseEther(String(config.relayer.minBalanceEth || "0.001"));
        if (balance < minBal) {
            throw new Error("Relayer ETH balance too low for gas");
        }
    }

    private isNonceError(msg: string): boolean {
        const m = msg.toLowerCase();
        return m.includes("nonce") && (m.includes("too low") || m.includes("already used") || m.includes("replacement"));
    }

    private isTransient(msg: string): boolean {
        const m = msg.toLowerCase();
        return m.includes("timeout") || m.includes("econnreset") || m.includes("network") || m.includes("429");
    }

    private async sendWithRetry<T extends ethers.ContractTransactionResponse>(
        send: () => Promise<T>
    ): Promise<T> {
        try {
            return await withRetry(send, {
                retries: 2,
                baseDelayMs: 400,
                maxDelayMs: 2500,
                shouldRetry: (err) => {
                    const msg = (err as any)?.message || String(err);
                    if (this.isTransient(msg)) return true;
                    if (this.isNonceError(msg)) return true;
                    return false;
                },
            });
        } catch (err: any) {
            const msg = err?.message || String(err);
            if (this.isNonceError(msg)) {
                await this.nonces.reset();
            }
            throw err;
        }
    }

    /**
     * Apply slippage tolerance to an amount
     */
    private applySlippage(amount: bigint, slippageBps: number): bigint {
        return (amount * BigInt(10000 - slippageBps)) / BigInt(10000);
    }

    /**
     * Get execution history
     */
    getHistory(): ExecutionResult[] {
        return [...this.executionHistory].reverse();
    }

    /**
     * Get on-chain execution stats
     */
    async getStats(): Promise<{
        totalExecutions: string;
        totalProfitGenerated: string;
        totalProtocolFees: string;
        totalUserProfit: string;
        totalGasRefunded: string;
        totalsByAsset: AssetTotals[];
    }> {
        try {
            if (!this.executor) {
                return {
                    totalExecutions: "0",
                    totalProfitGenerated: "0",
                    totalProtocolFees: "0",
                    totalUserProfit: "0",
                    totalGasRefunded: "0",
                    totalsByAsset: [],
                };
            }
            const [executions, profit, protocolFees, userProfit, gasRefunded, assets] = await Promise.all([
                this.executor.totalExecutions(),
                this.executor.totalProfitGenerated(),
                this.executor.totalProtocolFees(),
                this.executor.totalUserProfit(),
                this.executor.totalGasRefunded(),
                this.executor.getTrackedAssets().catch(() => []),
            ]);

            const uniqueAssets = Array.from(
                new Set(
                    (assets as string[]).concat([
                        config.tokens.USDC.address,
                        config.tokens.WETH.address,
                        Object.values(config.tokens).find((t) => t.symbol.toLowerCase() === "cbeth")?.address || "",
                    ])
                )
            ).filter((a) => ethers.isAddress(a) && a !== ethers.ZeroAddress);

            const totalsByAsset: AssetTotals[] = [];
            for (const asset of uniqueAssets) {
                const [vol, pGen, pFee, uProfit, gRef] = await Promise.all([
                    this.executor.totalArbitrageVolumeByAsset(asset),
                    this.executor.totalProfitGeneratedByAsset(asset),
                    this.executor.totalProtocolFeesByAsset(asset),
                    this.executor.totalUserProfitByAsset(asset),
                    this.executor.totalGasRefundedByAsset(asset),
                ]);
                const hasAny =
                    vol > 0n || pGen > 0n || pFee > 0n || uProfit > 0n || gRef > 0n;
                if (hasAny) {
                    totalsByAsset.push({
                        asset,
                        totalVolume: vol.toString(),
                        totalProfitGenerated: pGen.toString(),
                        totalProtocolFees: pFee.toString(),
                        totalUserProfit: uProfit.toString(),
                        totalGasRefunded: gRef.toString(),
                    });
                }
            }
            return {
                totalExecutions: executions.toString(),
                totalProfitGenerated: profit.toString(),
                totalProtocolFees: protocolFees.toString(),
                totalUserProfit: userProfit.toString(),
                totalGasRefunded: gasRefunded.toString(),
                totalsByAsset,
            };
        } catch {
            return {
                totalExecutions: "0",
                totalProfitGenerated: "0",
                totalProtocolFees: "0",
                totalUserProfit: "0",
                totalGasRefunded: "0",
                totalsByAsset: [],
            };
        }
    }

    /**
     * Get relayer wallet address
     */
    getAddress(): string {
        return this.wallet.address;
    }
}
