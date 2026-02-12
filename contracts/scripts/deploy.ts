import { deployProtocol } from "./deploy.lib";

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await deployProtocol();
}
