import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Arbitrage Infrastructure — Required Tests", function () {
  async function deployAaveFixture() {
    const [owner, relayer, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(owner.address);

    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(owner.address, ethers.parseUnits("200", "gwei"), true);

    const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
    const router = await ArbitrageRouter.deploy(owner.address, await treasury.getAddress());

    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const aavePool = await MockAavePool.deploy();

    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const executor = await FlashLoanExecutor.deploy(
      owner.address,
      await aavePool.getAddress(),
      await router.getAddress(),
      await treasury.getAddress(),
      await riskManager.getAddress()
    );

    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    await treasury.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await treasury.grantRole(EXECUTOR_ROLE, await router.getAddress());
    await router.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await router.grantRole(EXECUTOR_ROLE, relayer.address);
    await executor.grantRole(RELAYER_ROLE, relayer.address);

    await riskManager.setAssetConfig(await tokenA.getAddress(), true, ethers.parseEther("1000000"), 0, ethers.parseEther("10"));

    const MockDexAdapter = await ethers.getContractFactory("MockDexAdapter");
    const adapter = await MockDexAdapter.deploy();
    await router.connect(owner).setAdapter(await adapter.getAddress(), true);

    const loanAmount = ethers.parseEther("100");
    await tokenA.mint(await aavePool.getAddress(), loanAmount * 10n);

    return { owner, relayer, user, tokenA, tokenB, treasury, riskManager, router, aavePool, executor, adapter, loanAmount };
  }

  async function deployUniV3Fixture() {
    const [owner, relayer, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(owner.address);

    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(owner.address, ethers.parseUnits("200", "gwei"), true);

    const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
    const router = await ArbitrageRouter.deploy(owner.address, await treasury.getAddress());

    // Aave not configured to force UniV3 flash path.
    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const executor = await FlashLoanExecutor.deploy(
      owner.address,
      ethers.ZeroAddress,
      await router.getAddress(),
      await treasury.getAddress(),
      await riskManager.getAddress()
    );

    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    await treasury.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await treasury.grantRole(EXECUTOR_ROLE, await router.getAddress());
    await router.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await router.grantRole(EXECUTOR_ROLE, relayer.address);
    await executor.grantRole(RELAYER_ROLE, relayer.address);

    await riskManager.setAssetConfig(await tokenA.getAddress(), true, ethers.parseEther("1000000"), 0, ethers.parseEther("10"));

    const MockDexAdapter = await ethers.getContractFactory("MockDexAdapter");
    const adapter = await MockDexAdapter.deploy();
    await router.connect(owner).setAdapter(await adapter.getAddress(), true);

    const MockUniV3FlashPool = await ethers.getContractFactory("MockUniV3FlashPool");
    const flashPool = await MockUniV3FlashPool.deploy(await tokenA.getAddress(), await tokenB.getAddress(), 0); // 0 bps fee for deterministic tests
    await riskManager.setUniV3FlashPoolAllowed(await flashPool.getAddress(), true);

    const loanAmount = ethers.parseEther("10");
    await tokenA.mint(await flashPool.getAddress(), loanAmount * 10n);

    return { owner, relayer, user, tokenA, tokenB, treasury, riskManager, router, executor, adapter, flashPool, loanAmount };
  }

  function encodeSteps(steps: any[]) {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    return abi.encode(
      ["tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[]"],
      [steps]
    );
  }

  async function signIntent(params: {
    executor: any;
    user: any;
    asset: string;
    amount: bigint;
    routeHash: string;
    minNetProfit: bigint;
    deadline: number;
    refundRecipient: string;
    maxGasRefund: bigint;
  }) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const verifyingContract = await params.executor.getAddress();
    const nonce = await params.executor.nonces(params.user.address);

    const intent = {
      user: params.user.address,
      asset: params.asset,
      amount: params.amount,
      routeHash: params.routeHash,
      minNetProfit: params.minNetProfit,
      deadline: params.deadline,
      refundRecipient: params.refundRecipient,
      maxGasRefund: params.maxGasRefund,
      nonce,
    };

    const domain = { name: "BaseArbExecutor", version: "1", chainId, verifyingContract };
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

    const signature = await params.user.signTypedData(domain as any, types as any, intent as any);
    return { intent, signature };
  }

  it("Profitable arbitrage test", async function () {
    const { owner, relayer, user, tokenA, tokenB, treasury, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

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
        data: abi.encode(["uint16"], [100]), // +1%
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    const userBefore = await tokenA.balanceOf(user.address);
    const treasuryBefore = await tokenA.balanceOf(await treasury.getAddress());

    await executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature);

    const userAfter = await tokenA.balanceOf(user.address);
    const treasuryAfter = await tokenA.balanceOf(await treasury.getAddress());

    // Expected: start 100, minted 101, premium 0.05% => profit 0.95, fee 15%, user 85%
    const premium = (loanAmount * 5n) / 10_000n;
    const grossProfit = loanAmount + (loanAmount / 100n) - (loanAmount + premium); // 101% - owed
    const protocolFee = (grossProfit * 1500n) / 10_000n;
    const userProfit = grossProfit - protocolFee;

    expect(userAfter - userBefore).to.equal(userProfit);
    expect(treasuryAfter - treasuryBefore).to.equal(protocolFee);
    expect(await executor.totalExecutions()).to.equal(1);
    expect(await executor.totalProtocolFees()).to.equal(protocolFee);
    expect(await executor.totalUserProfit()).to.equal(userProfit);

    // Also track volume/profit by asset.
    expect(await executor.totalArbitrageVolumeByAsset(await tokenA.getAddress())).to.equal(loanAmount);
    expect(await executor.totalProtocolFeesByAsset(await tokenA.getAddress())).to.equal(protocolFee);
  });

  it("Unprofitable arbitrage revert test (users never lose money)", async function () {
    const { relayer, user, tokenA, tokenB, treasury, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

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
        data: abi.encode(["uint16"], [0]), // no bonus => cannot cover premium
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    const userBefore = await tokenA.balanceOf(user.address);
    const treasuryBefore = await tokenA.balanceOf(await treasury.getAddress());

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "Executor: insufficient for repayment"
    );

    expect(await tokenA.balanceOf(user.address)).to.equal(userBefore);
    expect(await tokenA.balanceOf(await treasury.getAddress())).to.equal(treasuryBefore);
    expect(await executor.totalExecutions()).to.equal(0);
  });

  it("Fee calculation test (15% performance fee)", async function () {
    const ProfitValidatorTest = await ethers.getContractFactory("ProfitValidatorTest");
    const validator = await ProfitValidatorTest.deploy();

    const grossProfit = ethers.parseEther("1");
    const [protocolFee, userProfit] = await validator.testCalculateFees(grossProfit);

    expect(protocolFee).to.equal(ethers.parseEther("0.15"));
    expect(userProfit).to.equal(ethers.parseEther("0.85"));
  });

  it("Reentrancy attack test (blocked by ReentrancyGuard)", async function () {
    const { owner, relayer, user, tokenA, tokenB, router, executor, adapter, flashPool, loanAmount } = await loadFixture(deployUniV3Fixture);

    const ReentrantDexAdapter = await ethers.getContractFactory("ReentrantDexAdapter");
    const reentrant = await ReentrantDexAdapter.deploy(await executor.getAddress());
    await router.connect(owner).setAdapter(await reentrant.getAddress(), true);

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
        adapter: await reentrant.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: "0x",
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(
      executor.connect(relayer).executeArbitrageWithIntentUniV3Flash(intent, steps, signature, await flashPool.getAddress())
    ).to.be.revertedWithCustomError(executor, "ReentrancyGuardReentrantCall");
  });

  it("Pausable test (executor pause blocks execution)", async function () {
    const { owner, relayer, user, tokenA, tokenB, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    await executor.connect(owner).pause();

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

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWithCustomError(
      executor,
      "EnforcedPause"
    );
  });

  it("Slippage test (minAmountOut enforced)", async function () {
    const { relayer, user, tokenA, tokenB, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: loanAmount + 1n, // impossible: adapter outputs amountIn (+bonus), but this exceeds
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

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "MockDexAdapter: slippage"
    );
  });

  it("Adapter allowlist test (RiskManager enforces when enabled)", async function () {
    const { owner, relayer, user, tokenA, tokenB, riskManager, executor, adapter, loanAmount } = await loadFixture(
      deployAaveFixture
    );

    await riskManager.connect(owner).setAdapterAllowlistEnforced(true);

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

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "Risk: adapter not allowed"
    );

    await riskManager.connect(owner).setAdapterAllowed(await adapter.getAddress(), true);
    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.not.be.reverted;
  });
});
