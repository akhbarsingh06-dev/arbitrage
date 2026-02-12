import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Base Arbitrage Protocol", function () {
    // ═══════════════════════════════════════
    //  FIXTURES
    // ═══════════════════════════════════════

    async function deployFixture() {
        const [owner, relayer, user, other] = await ethers.getSigners();

        // Deploy mock ERC20 tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        // Deploy Treasury
        const Treasury = await ethers.getContractFactory("Treasury");
        const treasury = await Treasury.deploy(owner.address);
        const treasuryAddr = await treasury.getAddress();

        // Deploy RiskManager
        const RiskManager = await ethers.getContractFactory("RiskManager");
        const riskManager = await RiskManager.deploy(owner.address, ethers.parseUnits("50", "gwei"), true);
        const riskManagerAddr = await riskManager.getAddress();

        // Deploy ArbitrageRouter
        const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
        const router = await ArbitrageRouter.deploy(owner.address, treasuryAddr);
        const routerAddr = await router.getAddress();

        // Deploy mock Aave Pool
        const MockAavePool = await ethers.getContractFactory("MockAavePool");
        const aavePool = await MockAavePool.deploy();
        const aavePoolAddr = await aavePool.getAddress();

        // Deploy FlashLoanExecutor
        const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
        const executor = await FlashLoanExecutor.deploy(
            owner.address,
            aavePoolAddr,
            routerAddr,
            treasuryAddr,
            riskManagerAddr
        );
        const executorAddr = await executor.getAddress();

        // Configure roles
        const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
        const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

        await treasury.grantRole(EXECUTOR_ROLE, executorAddr);
        await treasury.grantRole(EXECUTOR_ROLE, routerAddr);
        await router.grantRole(EXECUTOR_ROLE, executorAddr);
        await router.grantRole(EXECUTOR_ROLE, relayer.address);
        await executor.grantRole(RELAYER_ROLE, relayer.address);

        // Enable the mock WETH for flash borrowing in tests
        await riskManager.setAssetConfig(
            await weth.getAddress(),
            true,
            ethers.parseEther("1000000"),
            0,
            ethers.parseEther("1")
        );

        return {
            owner, relayer, user, other,
            treasury, router, executor, aavePool, riskManager,
            weth, usdc,
            treasuryAddr, routerAddr, executorAddr, riskManagerAddr,
            EXECUTOR_ROLE, RELAYER_ROLE,
        };
    }

    // ═══════════════════════════════════════
    //  TREASURY TESTS
    // ═══════════════════════════════════════

    describe("Treasury", function () {
        it("should accept fee deposits from executors", async function () {
            const { treasury, router, weth, owner, relayer, EXECUTOR_ROLE } = await loadFixture(deployFixture);

            // Mint tokens and approve
            await weth.mint(relayer.address, ethers.parseEther("100"));
            await weth.connect(relayer).approve(await treasury.getAddress(), ethers.parseEther("10"));

            // Grant relayer executor role for testing
            await treasury.grantRole(EXECUTOR_ROLE, relayer.address);

            // Deposit fee
            await treasury.connect(relayer).receiveFee(await weth.getAddress(), ethers.parseEther("10"));

            expect(await treasury.totalCollected(await weth.getAddress())).to.equal(ethers.parseEther("10"));
            expect(await treasury.balance(await weth.getAddress())).to.equal(ethers.parseEther("10"));
        });

        it("should reject deposits from non-executors", async function () {
            const { treasury, weth, other } = await loadFixture(deployFixture);

            await weth.mint(other.address, ethers.parseEther("100"));
            await weth.connect(other).approve(await treasury.getAddress(), ethers.parseEther("10"));

            await expect(
                treasury.connect(other).receiveFee(await weth.getAddress(), ethers.parseEther("10"))
            ).to.be.reverted;
        });

        it("should allow admin to withdraw fees", async function () {
            const { treasury, weth, owner, relayer, EXECUTOR_ROLE } = await loadFixture(deployFixture);

            // Setup: deposit fees
            await weth.mint(relayer.address, ethers.parseEther("100"));
            await weth.connect(relayer).approve(await treasury.getAddress(), ethers.parseEther("10"));
            await treasury.grantRole(EXECUTOR_ROLE, relayer.address);
            await treasury.connect(relayer).receiveFee(await weth.getAddress(), ethers.parseEther("10"));

            // Withdraw
            const balBefore = await weth.balanceOf(owner.address);
            await treasury.withdraw(await weth.getAddress(), owner.address, ethers.parseEther("5"));
            const balAfter = await weth.balanceOf(owner.address);

            expect(balAfter - balBefore).to.equal(ethers.parseEther("5"));
        });

        it("should reject withdrawal from non-admin", async function () {
            const { treasury, weth, other } = await loadFixture(deployFixture);

            await expect(
                treasury.connect(other).withdraw(await weth.getAddress(), other.address, ethers.parseEther("1"))
            ).to.be.reverted;
        });

        it("should support pause/unpause", async function () {
            const { treasury, weth, owner, relayer, EXECUTOR_ROLE } = await loadFixture(deployFixture);

            await treasury.grantRole(EXECUTOR_ROLE, relayer.address);
            await treasury.pause();

            await weth.mint(relayer.address, ethers.parseEther("100"));
            await weth.connect(relayer).approve(await treasury.getAddress(), ethers.parseEther("10"));

            await expect(
                treasury.connect(relayer).receiveFee(await weth.getAddress(), ethers.parseEther("10"))
            ).to.be.reverted;

            await treasury.unpause();
            await treasury.connect(relayer).receiveFee(await weth.getAddress(), ethers.parseEther("10"));
            expect(await treasury.balance(await weth.getAddress())).to.equal(ethers.parseEther("10"));
        });

        it("should support emergency withdraw", async function () {
            const { treasury, weth, owner, relayer, EXECUTOR_ROLE } = await loadFixture(deployFixture);

            await weth.mint(relayer.address, ethers.parseEther("50"));
            await weth.connect(relayer).approve(await treasury.getAddress(), ethers.parseEther("50"));
            await treasury.grantRole(EXECUTOR_ROLE, relayer.address);
            await treasury.connect(relayer).receiveFee(await weth.getAddress(), ethers.parseEther("50"));

            await treasury.emergencyWithdraw(await weth.getAddress(), owner.address);
            expect(await treasury.balance(await weth.getAddress())).to.equal(0);
        });
    });

    // ═══════════════════════════════════════
    //  PROFIT VALIDATOR TESTS
    // ═══════════════════════════════════════

    describe("ProfitValidator", function () {
        it("should correctly calculate 15% protocol fee", async function () {
            // Deploy a helper contract that exposes library functions
            const ProfitValidatorTest = await ethers.getContractFactory("ProfitValidatorTest");
            const validator = await ProfitValidatorTest.deploy();

            const grossProfit = ethers.parseEther("1");
            const [protocolFee, userProfit] = await validator.testCalculateFees(grossProfit);

            // 15% fee
            expect(protocolFee).to.equal(ethers.parseEther("0.15"));
            // 85% user
            expect(userProfit).to.equal(ethers.parseEther("0.85"));
        });

        it("should return correct profitability check", async function () {
            const ProfitValidatorTest = await ethers.getContractFactory("ProfitValidatorTest");
            const validator = await ProfitValidatorTest.deploy();

            // Profitable
            const [isProfitable1, profit1] = await validator.testIsProfitable(
                ethers.parseEther("10"),
                ethers.parseEther("9")
            );
            expect(isProfitable1).to.be.true;
            expect(profit1).to.equal(ethers.parseEther("1"));

            // Unprofitable
            const [isProfitable2, profit2] = await validator.testIsProfitable(
                ethers.parseEther("9"),
                ethers.parseEther("10")
            );
            expect(isProfitable2).to.be.false;
            expect(profit2).to.equal(0);
        });
    });

    // ═══════════════════════════════════════
    //  ARBITRAGE ROUTER TESTS
    // ═══════════════════════════════════════

    describe("ArbitrageRouter", function () {
        it("should reject calls from non-executors", async function () {
            const { router, other } = await loadFixture(deployFixture);

            await expect(
                router.connect(other).executeRoute([], ethers.ZeroAddress, 0, 0, other.address, 0)
            ).to.be.reverted;
        });

        it("should reject expired deadlines", async function () {
            const { router, relayer, weth } = await loadFixture(deployFixture);
            const wethAddr = await weth.getAddress();

            await expect(
                router.connect(relayer).executeRoute(
                    [
                        { adapter: ethers.ZeroAddress, tokenIn: wethAddr, tokenOut: wethAddr, amountIn: 0, minAmountOut: 0, data: "0x" },
                        { adapter: ethers.ZeroAddress, tokenIn: wethAddr, tokenOut: wethAddr, amountIn: 0, minAmountOut: 0, data: "0x" },
                    ],
                    wethAddr,
                    0,
                    0,
                    relayer.address,
                    1 // expired timestamp
                )
            ).to.be.revertedWith("Router: expired deadline");
        });

        it("should allow admin to register adapters", async function () {
            const { router, owner, other } = await loadFixture(deployFixture);

            await router.setAdapter(other.address, true);
            expect(await router.registeredAdapters(other.address)).to.be.true;

            await router.setAdapter(other.address, false);
            expect(await router.registeredAdapters(other.address)).to.be.false;
        });

        it("should allow admin to update settings", async function () {
            const { router, owner } = await loadFixture(deployFixture);

            await router.setMaxSlippage(200);
            expect(await router.maxSlippageBps()).to.equal(200);

            await router.setMaxGasPrice(ethers.parseUnits("100", "gwei"));
            expect(await router.maxGasPrice()).to.equal(ethers.parseUnits("100", "gwei"));
        });
    });

    // ═══════════════════════════════════════
    //  FLASH LOAN EXECUTOR TESTS
    // ═══════════════════════════════════════

    describe("FlashLoanExecutor", function () {
        it("should reject calls from non-relayers", async function () {
            const { executor, other, weth } = await loadFixture(deployFixture);

            await expect(
                executor.connect(other).executeArbitrage(
                    await weth.getAddress(),
                    ethers.parseEther("1"),
                    [],
                    0,
                    other.address,
                    Math.floor(Date.now() / 1000) + 3600
                )
            ).to.be.reverted;
        });

        it("should execute with signed intent and refund keeper", async function () {
            const { owner, relayer, user, router, executor, aavePool, riskManager } = await loadFixture(deployFixture);

            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
            const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

            const MockDexAdapter = await ethers.getContractFactory("MockDexAdapter");
            const adapter = await MockDexAdapter.deploy();

            await router.connect(owner).setAdapter(await adapter.getAddress(), true);

            const loanAmount = ethers.parseEther("100");
            await tokenA.mint(await aavePool.getAddress(), loanAmount * 2n);

            await riskManager.setAssetConfig(
                await tokenA.getAddress(),
                true,
                ethers.parseEther("1000000"),
                0,
                ethers.parseEther("1")
            );

            const abi = ethers.AbiCoder.defaultAbiCoder();
            const steps = [
                {
                    adapter: await adapter.getAddress(),
                    tokenIn: await tokenA.getAddress(),
                    tokenOut: await tokenB.getAddress(),
                    amountIn: 0,
                    minAmountOut: 1,
                    data: abi.encode(["uint16"], [0]),
                },
                {
                    adapter: await adapter.getAddress(),
                    tokenIn: await tokenB.getAddress(),
                    tokenOut: await tokenA.getAddress(),
                    amountIn: 0,
                    minAmountOut: 1,
                    data: abi.encode(["uint16"], [100]),
                },
            ];

            const routeEncoded = abi.encode(
                [
                    "tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[]",
                ],
                [steps]
            );
            const routeHash = ethers.keccak256(routeEncoded);
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const verifyingContract = await executor.getAddress();

            const nonce = await executor.nonces(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const maxGasRefund = ethers.parseEther("0.05");

            const intent = {
                user: user.address,
                asset: await tokenA.getAddress(),
                amount: loanAmount,
                routeHash,
                minNetProfit: 0,
                deadline,
                refundRecipient: relayer.address,
                maxGasRefund,
                nonce,
            };

            const domain = {
                name: "BaseArbExecutor",
                version: "1",
                chainId,
                verifyingContract,
            };
            const types = {
                ExecutionIntent: [
                    { name: "user", type: "address" },
                    { name: "asset", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "routeHash", type: "bytes32" },
                    { name: "minNetProfit", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "refundRecipient", type: "address" },
                    { name: "maxGasRefund", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                ],
            };

            const sig = await user.signTypedData(domain as any, types as any, intent as any);
            const relayerBalBefore = await tokenA.balanceOf(relayer.address);

            await executor.connect(relayer).executeArbitrageWithIntent(intent, steps, sig);

            const relayerBalAfter = await tokenA.balanceOf(relayer.address);
            expect(relayerBalAfter - relayerBalBefore).to.equal(maxGasRefund);
            expect(await executor.nonces(user.address)).to.equal(nonce + 1n);
            expect(await executor.totalExecutions()).to.equal(1);
            expect(await executor.totalProfitGenerated()).to.be.gt(0);
        });

        it("should reject zero user address", async function () {
            const { executor, relayer, weth } = await loadFixture(deployFixture);
            const wethAddr = await weth.getAddress();

            await expect(
                executor.connect(relayer).executeArbitrage(
                    wethAddr,
                    ethers.parseEther("1"),
                    [
                        { adapter: ethers.ZeroAddress, tokenIn: wethAddr, tokenOut: wethAddr, amountIn: 0, minAmountOut: 0, data: "0x" },
                        { adapter: ethers.ZeroAddress, tokenIn: wethAddr, tokenOut: wethAddr, amountIn: 0, minAmountOut: 0, data: "0x" },
                    ],
                    0,
                    ethers.ZeroAddress,
                    Math.floor(Date.now() / 1000) + 3600
                )
            ).to.be.revertedWith("Risk: zero user");
        });

        it("should allow admin to update circuit breakers", async function () {
            const { riskManager, weth, owner } = await loadFixture(deployFixture);

            await riskManager.setGlobalLimits(ethers.parseUnits("100", "gwei"), true);
            expect(await riskManager.maxGasPrice()).to.equal(ethers.parseUnits("100", "gwei"));

            await riskManager.setAssetConfig(
                await weth.getAddress(),
                true,
                ethers.parseEther("500"),
                0,
                ethers.parseEther("1")
            );
            const cfg = await riskManager.assetConfigs(await weth.getAddress());
            expect(cfg.maxFlashLoanAmount).to.equal(ethers.parseEther("500"));
        });

        it("should track execution stats", async function () {
            const { executor } = await loadFixture(deployFixture);
            expect(await executor.totalExecutions()).to.equal(0);
            expect(await executor.totalProfitGenerated()).to.equal(0);
            expect(await executor.totalProtocolFees()).to.equal(0);
            expect(await executor.totalUserProfit()).to.equal(0);
            expect(await executor.totalGasRefunded()).to.equal(0);
        });
    });
});
