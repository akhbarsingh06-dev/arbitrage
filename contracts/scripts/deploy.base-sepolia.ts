import { deployProtocol } from "./deploy.lib";

async function main() {
  await deployProtocol({ expectedChainId: 84532, deploymentTag: "base-sepolia" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

