import { ethers } from "hardhat";

function requireAddr(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!ethers.isAddress(v) || v === ethers.ZeroAddress) throw new Error(`Missing/invalid ${name}`);
  return v;
}

function optionalAddr(name: string): string | null {
  const v = (process.env[name] || "").trim();
  if (!v) return null;
  return ethers.isAddress(v) && v !== ethers.ZeroAddress ? v : null;
}

function optionalEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
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
  const defaultPriority = ethers.parseUnits("0.001", "gwei");

  const envPriority = optionalEnv("DEPLOY_PRIORITY_FEE_GWEI");
  const envMaxFee = optionalEnv("DEPLOY_MAX_FEE_GWEI");

  let maxPriorityFeePerGas =
    (envPriority ? ethers.parseUnits(envPriority, "gwei") : null) ??
    (feeData.maxPriorityFeePerGas as bigint | null) ??
    defaultPriority;

  let maxFeePerGas =
    (envMaxFee ? ethers.parseUnits(envMaxFee, "gwei") : null) ??
    (feeData.maxFeePerGas as bigint | null) ??
    (feeData.gasPrice ? (feeData.gasPrice as bigint) * 2n : ethers.parseUnits("0.01", "gwei"));

  maxPriorityFeePerGas = (maxPriorityFeePerGas * 125n) / 100n;
  maxFeePerGas = maxBigint((maxFeePerGas * 125n) / 100n, maxPriorityFeePerGas + 1n);

  return {
    next() {
      return { nonce: nonce++, maxFeePerGas, maxPriorityFeePerGas };
    },
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  if (chainId !== 8453) throw new Error(`Wrong network: expected 8453 got ${chainId}`);

  // Existing core contracts from the partial deploy.
  const treasuryAddr = requireAddr("TREASURY_ADDRESS");
  const riskManagerAddr = requireAddr("RISK_MANAGER_ADDRESS");
  const routerAddr = requireAddr("ARBITRAGE_ROUTER_ADDRESS");
  const executorAddr = requireAddr("FLASH_LOAN_EXECUTOR_ADDRESS");

  const txm = await createTxManager(deployer.address);

  console.log("Resuming deployment on Base mainnet");
  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasuryAddr);
  console.log("RiskManager:", riskManagerAddr);
  console.log("Router:", routerAddr);
  console.log("Executor:", executorAddr);

  // Deploy adapters if missing
  let uniAdapterAddr = optionalAddr("UNISWAP_V3_ADAPTER_ADDRESS");
  let pancakeAdapterAddr = optionalAddr("PANCAKESWAP_V3_ADAPTER_ADDRESS");
  let aeroAdapterAddr = optionalAddr("AERODROME_ADAPTER_ADDRESS");

  const UNISWAP_V3_ROUTER = process.env.UNISWAP_V3_ROUTER || "";
  const UNISWAP_V3_QUOTER = process.env.UNISWAP_V3_QUOTER || "";
  const PANCAKESWAP_V3_ROUTER = process.env.PANCAKESWAP_V3_ROUTER || "";
  const PANCAKESWAP_V3_QUOTER = process.env.PANCAKESWAP_V3_QUOTER || "";
  const AERODROME_ROUTER = process.env.AERODROME_ROUTER || "";
  if (!UNISWAP_V3_ROUTER || !UNISWAP_V3_QUOTER || !PANCAKESWAP_V3_ROUTER || !PANCAKESWAP_V3_QUOTER || !AERODROME_ROUTER) {
    throw new Error("Missing UNISWAP_V3_ROUTER/UNISWAP_V3_QUOTER/PANCAKESWAP_V3_ROUTER/PANCAKESWAP_V3_QUOTER/AERODROME_ROUTER in env");
  }

  if (!uniAdapterAddr) {
    console.log("Deploying UniswapV3Adapter...");
    const UniswapV3Adapter = await ethers.getContractFactory("UniswapV3Adapter");
    const uni = await UniswapV3Adapter.deploy(UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER, txm.next());
    await uni.waitForDeployment();
    uniAdapterAddr = await uni.getAddress();
    console.log("  UniswapV3Adapter:", uniAdapterAddr);
  } else {
    console.log("Using existing UniswapV3Adapter:", uniAdapterAddr);
  }

  if (!pancakeAdapterAddr) {
    console.log("Deploying PancakeV3Adapter...");
    const PancakeV3Adapter = await ethers.getContractFactory("PancakeV3Adapter");
    const pancake = await PancakeV3Adapter.deploy(PANCAKESWAP_V3_ROUTER, PANCAKESWAP_V3_QUOTER, txm.next());
    await pancake.waitForDeployment();
    pancakeAdapterAddr = await pancake.getAddress();
    console.log("  PancakeV3Adapter:", pancakeAdapterAddr);
  } else {
    console.log("Using existing PancakeV3Adapter:", pancakeAdapterAddr);
  }

  if (!aeroAdapterAddr) {
    console.log("Deploying AerodromeAdapter...");
    const AerodromeAdapter = await ethers.getContractFactory("AerodromeAdapter");
    const aero = await AerodromeAdapter.deploy(AERODROME_ROUTER, txm.next());
    await aero.waitForDeployment();
    aeroAdapterAddr = await aero.getAddress();
    console.log("  AerodromeAdapter:", aeroAdapterAddr);
  } else {
    console.log("Using existing AerodromeAdapter:", aeroAdapterAddr);
  }

  const treasury = await ethers.getContractAt("Treasury", treasuryAddr);
  const router = await ethers.getContractAt("ArbitrageRouter", routerAddr);
  const executor = await ethers.getContractAt("FlashLoanExecutor", executorAddr);
  const riskManager = await ethers.getContractAt("RiskManager", riskManagerAddr);

  console.log("Configuring roles & adapters...");
  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
  const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

  await (await treasury.grantRole(EXECUTOR_ROLE, executorAddr, txm.next())).wait();
  await (await treasury.grantRole(EXECUTOR_ROLE, routerAddr, txm.next())).wait();
  await (await router.grantRole(EXECUTOR_ROLE, executorAddr, txm.next())).wait();

  const relayerAddressEnv = optionalEnv("RELAYER_ADDRESS");
  const relayerPkEnv = optionalEnv("RELAYER_PRIVATE_KEY");
  const relayerAddress =
    (relayerAddressEnv && ethers.isAddress(relayerAddressEnv) && relayerAddressEnv) ||
    (relayerPkEnv && isHexPrivateKey(relayerPkEnv) ? new ethers.Wallet(relayerPkEnv).address : null) ||
    deployer.address;

  await (await executor.grantRole(RELAYER_ROLE, relayerAddress, txm.next())).wait();

  await (await router.setAdapter(uniAdapterAddr, true, txm.next())).wait();
  await (await router.setAdapter(pancakeAdapterAddr, true, txm.next())).wait();
  await (await router.setAdapter(aeroAdapterAddr, true, txm.next())).wait();

  // Asset configs
  const WETH = optionalEnv("WETH_ADDRESS");
  const USDC = optionalEnv("USDC_ADDRESS");
  const CBETH = optionalEnv("CBETH_ADDRESS");
  if (WETH && ethers.isAddress(WETH)) await (await riskManager.setAssetConfig(WETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"), txm.next())).wait();
  if (USDC && ethers.isAddress(USDC)) await (await riskManager.setAssetConfig(USDC, true, 1_000_000n * 1_000_000n, 0, 2_000_000n, txm.next())).wait();
  if (CBETH && ethers.isAddress(CBETH)) await (await riskManager.setAssetConfig(CBETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"), txm.next())).wait();

  // Save deployment json for sync tooling
  const deployment = {
    tag: "base-mainnet-resume",
    chainId,
    network: String(net.name ?? ""),
    timestamp: new Date().toISOString(),
    contracts: {
      treasury: treasuryAddr,
      riskManager: riskManagerAddr,
      arbitrageRouter: routerAddr,
      flashLoanExecutor: executorAddr,
      uniswapV3Adapter: uniAdapterAddr,
      pancakeV3Adapter: pancakeAdapterAddr,
      aerodromeAdapter: aeroAdapterAddr,
    },
    external: {
      aavePool: process.env.AAVE_POOL || "",
      uniswapV3Router: UNISWAP_V3_ROUTER,
      uniswapV3Quoter: UNISWAP_V3_QUOTER,
      pancakeswapV3Router: PANCAKESWAP_V3_ROUTER,
      pancakeswapV3Quoter: PANCAKESWAP_V3_QUOTER,
      aerodromeRouter: AERODROME_ROUTER,
    },
    relayer: {
      address: relayerAddress,
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const filename = `deployment-${chainId}-${Date.now()}.json`;
  fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(deployment, null, 2));
  console.log(`Deployment saved to: deployments/${filename}`);

  console.log("Resume complete.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
