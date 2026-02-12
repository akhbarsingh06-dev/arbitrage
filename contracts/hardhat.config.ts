import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

// Load env from either package root (`contracts/.env`) or repo root (`../.env`).
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function normalizePrivateKey(pk: string | undefined): string {
  if (!pk) return "0x" + "0".repeat(64);
  const v = pk.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(v) ? v : "0x" + "0".repeat(64);
}

const DEPLOYER_PRIVATE_KEY = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY);
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const FORK_ENABLED = String(process.env.FORK_ENABLED || "").toLowerCase() === "true";
const REPORT_GAS = String(process.env.REPORT_GAS || "").toLowerCase() === "true";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    tests: "./tests",
  },
  networks: {
    hardhat: {
      forking: {
        url: BASE_RPC_URL,
        enabled: FORK_ENABLED,
      },
    },
    base: {
      url: BASE_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
    "base-sepolia": {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY,
      "base-sepolia": BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  gasReporter: {
    enabled: REPORT_GAS,
    currency: "USD",
  },
};

export default config;
