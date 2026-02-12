import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

export const chains = [base] as const;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const rpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || "https://mainnet.base.org";

const transports = { [base.id]: http(rpcUrl) } as const;

const connectors = [
  injected(),
  coinbaseWallet({ appName: "Base Arbitrage Protocol" }),
  ...(projectId && projectId.length > 0
    ? [walletConnect({ projectId, showQrModal: true })]
    : []),
];

export const wagmiConfig = createConfig({
  chains,
  ssr: false,
  transports,
  connectors,
});
