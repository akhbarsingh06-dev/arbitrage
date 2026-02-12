import { deployProtocol } from "./deploy.lib";

async function main() {
  await deployProtocol({ expectedChainId: 8453, deploymentTag: "base-mainnet" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

