import { ethers } from "hardhat";

export type DeployOptions = {
  expectedChainId?: number;
  deploymentTag?: string;
};

type TxOverrides = {
  nonce: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function optionalEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

function isHexPrivateKey(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

function maxBigint(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

async function createTxManager(fromAddress: string) {
  let nonce = await ethers.provider.getTransactionCount(fromAddress, "pending");

  const feeData = await ethers.provider.getFeeData();
  const defaultPriority = ethers.parseUnits("0.001", "gwei"); // 1,000,000 wei
  const envPriority = optionalEnv("DEPLOY_PRIORITY_FEE_GWEI");
  const envMaxFee = optionalEnv("DEPLOY_MAX_FEE_GWEI");

  let maxPriorityFeePerGas =
    (envPriority ? ethers.parseUnits(envPriority, "gwei") : null) ??
    (feeData.maxPriorityFeePerGas as bigint | null) ??
    defaultPriority;

  // Base L2 fee markets can return tiny values; keep a small safety bump.
  let maxFeePerGas =
    (envMaxFee ? ethers.parseUnits(envMaxFee, "gwei") : null) ??
    (feeData.maxFeePerGas as bigint | null) ??
    (feeData.gasPrice ? (feeData.gasPrice as bigint) * 2n : ethers.parseUnits("0.01", "gwei"));

  // Bump by 25% and ensure maxFee >= priority + 1
  maxPriorityFeePerGas = (maxPriorityFeePerGas * 125n) / 100n;
  maxFeePerGas = maxBigint((maxFeePerGas * 125n) / 100n, maxPriorityFeePerGas + 1n);

  return {
    next(): TxOverrides {
      return { nonce: nonce++, maxFeePerGas, maxPriorityFeePerGas };
    },
    snapshot() {
      return { nextNonce: nonce, maxFeePerGas: maxFeePerGas.toString(), maxPriorityFeePerGas: maxPriorityFeePerGas.toString() };
    },
  };
}

export async function deployProtocol(opts: DeployOptions = {}) {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  if (typeof opts.expectedChainId === "number" && chainId !== opts.expectedChainId) {
    throw new Error(`Wrong network: expected chainId=${opts.expectedChainId} got chainId=${chainId}`);
  }

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const AAVE_POOL = requireEnv("AAVE_POOL"); // may be 0x0 for networks without Aave
  const UNISWAP_V3_ROUTER = requireEnv("UNISWAP_V3_ROUTER");
  const UNISWAP_V3_QUOTER = requireEnv("UNISWAP_V3_QUOTER");
  const PANCAKESWAP_V3_ROUTER = requireEnv("PANCAKESWAP_V3_ROUTER");
  const PANCAKESWAP_V3_QUOTER = requireEnv("PANCAKESWAP_V3_QUOTER");
  const AERODROME_ROUTER = requireEnv("AERODROME_ROUTER");

  const txm = await createTxManager(deployer.address);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Deploying Base Arbitrage Protocol");
  console.log("═══════════════════════════════════════════════\n");

  const deployment: any = {
    tag: opts.deploymentTag ?? "",
    chainId,
    network: String(net.name ?? ""),
    timestamp: new Date().toISOString(),
    contracts: {},
    external: {
      aavePool: AAVE_POOL,
      uniswapV3Router: UNISWAP_V3_ROUTER,
      uniswapV3Quoter: UNISWAP_V3_QUOTER,
      pancakeswapV3Router: PANCAKESWAP_V3_ROUTER,
      pancakeswapV3Quoter: PANCAKESWAP_V3_QUOTER,
      aerodromeRouter: AERODROME_ROUTER,
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const filename = `deployment-${chainId}-${Date.now()}.json`;
  const saveDeployment = (extra: any = {}) => {
    fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify({ ...deployment, ...extra }, null, 2));
  };

  try {
    // 1. Deploy Treasury
    console.log("1/6 Deploying Treasury...");
    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(deployer.address, txm.next());
    await treasury.waitForDeployment();
    const treasuryAddr = await treasury.getAddress();
    deployment.contracts.treasury = treasuryAddr;
    saveDeployment();
    console.log("  Treasury deployed:", treasuryAddr);

    // 2. Deploy RiskManager
    console.log("2/6 Deploying RiskManager...");
    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(deployer.address, ethers.parseUnits("50", "gwei"), true, txm.next());
    await riskManager.waitForDeployment();
    const riskManagerAddr = await riskManager.getAddress();
    deployment.contracts.riskManager = riskManagerAddr;
    saveDeployment();
    console.log("  RiskManager deployed:", riskManagerAddr);

    // 3. Deploy ArbitrageRouter
    console.log("3/6 Deploying ArbitrageRouter...");
    const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
    const router = await ArbitrageRouter.deploy(deployer.address, treasuryAddr, txm.next());
    await router.waitForDeployment();
    const routerAddr = await router.getAddress();
    deployment.contracts.arbitrageRouter = routerAddr;
    saveDeployment();
    console.log("  ArbitrageRouter deployed:", routerAddr);

    // 4. Deploy FlashLoanExecutor
    console.log("4/6 Deploying FlashLoanExecutor...");
    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const executor = await FlashLoanExecutor.deploy(
      deployer.address,
      AAVE_POOL,
      routerAddr,
      treasuryAddr,
      riskManagerAddr,
      txm.next()
    );
    await executor.waitForDeployment();
    const executorAddr = await executor.getAddress();
    deployment.contracts.flashLoanExecutor = executorAddr;
    saveDeployment();
    console.log("  FlashLoanExecutor deployed:", executorAddr);

    // 5. Deploy DEX Adapters
    console.log("5/7 Deploying UniswapV3Adapter...");
    const UniswapV3Adapter = await ethers.getContractFactory("UniswapV3Adapter");
    const uniAdapter = await UniswapV3Adapter.deploy(UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER, txm.next());
    await uniAdapter.waitForDeployment();
    const uniAdapterAddr = await uniAdapter.getAddress();
    deployment.contracts.uniswapV3Adapter = uniAdapterAddr;
    saveDeployment();
    console.log("  UniswapV3Adapter deployed:", uniAdapterAddr);

    console.log("6/7 Deploying PancakeV3Adapter...");
    const PancakeV3Adapter = await ethers.getContractFactory("PancakeV3Adapter");
    const pancakeAdapter = await PancakeV3Adapter.deploy(PANCAKESWAP_V3_ROUTER, PANCAKESWAP_V3_QUOTER, txm.next());
    await pancakeAdapter.waitForDeployment();
    const pancakeAdapterAddr = await pancakeAdapter.getAddress();
    deployment.contracts.pancakeV3Adapter = pancakeAdapterAddr;
    saveDeployment();
    console.log("  PancakeV3Adapter deployed:", pancakeAdapterAddr);

    console.log("7/7 Deploying AerodromeAdapter...");
    const AerodromeAdapter = await ethers.getContractFactory("AerodromeAdapter");
    const aeroAdapter = await AerodromeAdapter.deploy(AERODROME_ROUTER, txm.next());
    await aeroAdapter.waitForDeployment();
    const aeroAdapterAddr = await aeroAdapter.getAddress();
    deployment.contracts.aerodromeAdapter = aeroAdapterAddr;
    saveDeployment();
    console.log("  AerodromeAdapter deployed:", aeroAdapterAddr);

    // Configure roles & register adapters
    console.log("\nConfiguring roles and adapters...");

    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    await (await treasury.grantRole(EXECUTOR_ROLE, executorAddr, txm.next())).wait();
    await (await treasury.grantRole(EXECUTOR_ROLE, routerAddr, txm.next())).wait();
    console.log("  Granted EXECUTOR_ROLE on Treasury to Executor and Router");

    await (await router.grantRole(EXECUTOR_ROLE, executorAddr, txm.next())).wait();
    console.log("  Granted EXECUTOR_ROLE on Router to Executor");

    // Grant RELAYER_ROLE to a dedicated relayer if configured; otherwise default to deployer.
    const relayerAddressEnv = optionalEnv("RELAYER_ADDRESS");
    const relayerPkEnv = optionalEnv("RELAYER_PRIVATE_KEY");
    const relayerAddress =
      (relayerAddressEnv && ethers.isAddress(relayerAddressEnv) && relayerAddressEnv) ||
      (relayerPkEnv && isHexPrivateKey(relayerPkEnv) ? new ethers.Wallet(relayerPkEnv).address : null) ||
      deployer.address;

    await (await executor.grantRole(RELAYER_ROLE, relayerAddress, txm.next())).wait();
    console.log("  Granted RELAYER_ROLE on Executor to relayer", { relayerAddress });

    await (await router.setAdapter(uniAdapterAddr, true, txm.next())).wait();
    await (await router.setAdapter(pancakeAdapterAddr, true, txm.next())).wait();
    await (await router.setAdapter(aeroAdapterAddr, true, txm.next())).wait();
    console.log("  Registered Uniswap V3, PancakeSwap V3, and Aerodrome adapters");

    // Optional: configure initial RiskManager per-asset configs
    const WETH = optionalEnv("WETH_ADDRESS");
    const USDC = optionalEnv("USDC_ADDRESS");
    const CBETH = optionalEnv("CBETH_ADDRESS");

    if (WETH) await (await riskManager.setAssetConfig(WETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"), txm.next())).wait();
    if (USDC) await (await riskManager.setAssetConfig(USDC, true, 1_000_000n * 1_000_000n, 0, 2_000_000n, txm.next())).wait();
    if (CBETH) await (await riskManager.setAssetConfig(CBETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"), txm.next())).wait();

    console.log("  RiskManager asset configs:", { WETH: !!WETH, USDC: !!USDC, CBETH: !!CBETH });

    saveDeployment({ txManager: txm.snapshot() });

    // Summary
    console.log("\n═══════════════════════════════════════════════");
    console.log("  DEPLOYMENT COMPLETE");
    console.log("═══════════════════════════════════════════════");
    console.log("");
    console.log("  Treasury:           ", treasuryAddr);
    console.log("  RiskManager:        ", riskManagerAddr);
    console.log("  ArbitrageRouter:    ", routerAddr);
    console.log("  FlashLoanExecutor:  ", executorAddr);
    console.log("  UniswapV3Adapter:   ", uniAdapterAddr);
    console.log("  PancakeV3Adapter:   ", pancakeAdapterAddr);
    console.log("  AerodromeAdapter:   ", aeroAdapterAddr);
    console.log("");

    console.log(`  Deployment saved to: deployments/${filename}`);
    return deployment;
  } catch (err: any) {
    saveDeployment({ error: String(err?.message || err) });
    console.error(`Deployment failed; partial deployment saved to: deployments/${filename}`);
    throw err;
  }

}
