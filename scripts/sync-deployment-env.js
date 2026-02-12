#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function findLatestDeployment(repoRoot) {
  const dir = path.join(repoRoot, "contracts", "deployments");
  if (!fs.existsSync(dir)) throw new Error(`Missing deployments dir: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("deployment-") && f.endsWith(".json"))
    .map((f) => path.join(dir, f));
  if (files.length === 0) throw new Error(`No deployment-*.json files found in ${dir}`);
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function upsertEnvLines(existing, updates) {
  const lines = existing.split(/\r?\n/);
  const seen = new Set();

  const out = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  const missing = Object.keys(updates).filter((k) => !seen.has(k));
  if (missing.length > 0) {
    if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
    out.push("# Synced from latest deployment JSON");
    for (const k of missing) out.push(`${k}=${updates[k]}`);
  }

  return out.join("\n");
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const deploymentPath = findLatestDeployment(repoRoot);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const contracts = deployment?.contracts || {};
  const required = [
    "treasury",
    "riskManager",
    "arbitrageRouter",
    "flashLoanExecutor",
    "uniswapV3Adapter",
    "aerodromeAdapter",
  ];
  for (const k of required) {
    if (!contracts[k] || typeof contracts[k] !== "string" || !contracts[k].startsWith("0x")) {
      throw new Error(`Deployment file missing contracts.${k}`);
    }
  }
  const optional = ["pancakeV3Adapter"];

  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}. Create it from .env.example first.`);
  const env = fs.readFileSync(envPath, "utf8");

  const updates = {
    TREASURY_ADDRESS: contracts.treasury,
    RISK_MANAGER_ADDRESS: contracts.riskManager,
    ARBITRAGE_ROUTER_ADDRESS: contracts.arbitrageRouter,
    FLASH_LOAN_EXECUTOR_ADDRESS: contracts.flashLoanExecutor,
    UNISWAP_V3_ADAPTER_ADDRESS: contracts.uniswapV3Adapter,
    AERODROME_ADAPTER_ADDRESS: contracts.aerodromeAdapter,
    NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS: contracts.flashLoanExecutor,
  };

  for (const k of optional) {
    if (contracts[k] && typeof contracts[k] === "string" && contracts[k].startsWith("0x")) {
      if (k === "pancakeV3Adapter") updates.PANCAKESWAP_V3_ADAPTER_ADDRESS = contracts[k];
    }
  }

  fs.writeFileSync(envPath, upsertEnvLines(env, updates), "utf8");

  const feEnvPath = path.join(repoRoot, "frontend", ".env.local");
  if (fs.existsSync(feEnvPath)) {
    const feEnv = fs.readFileSync(feEnvPath, "utf8");
    fs.writeFileSync(
      feEnvPath,
      upsertEnvLines(feEnv, { NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS: contracts.flashLoanExecutor }),
      "utf8"
    );
  }

  console.log("Synced deployment into env:");
  console.log("  deployment:", deploymentPath);
  console.log("  executor:  ", contracts.flashLoanExecutor);
  console.log("  treasury:  ", contracts.treasury);
  console.log("  router:    ", contracts.arbitrageRouter);
}

main();
