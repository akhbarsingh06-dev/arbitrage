/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
    reactStrictMode: true,
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001",
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
        NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS: process.env.NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS || "",
        NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
        NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS || "",
        NEXT_PUBLIC_WETH_ADDRESS: process.env.NEXT_PUBLIC_WETH_ADDRESS || "",
        NEXT_PUBLIC_CBETH_ADDRESS: process.env.NEXT_PUBLIC_CBETH_ADDRESS || "",
        NEXT_PUBLIC_DAI_ADDRESS: process.env.NEXT_PUBLIC_DAI_ADDRESS || "",
        NEXT_PUBLIC_USDBC_ADDRESS: process.env.NEXT_PUBLIC_USDBC_ADDRESS || "",
        NEXT_PUBLIC_CBBTC_ADDRESS: process.env.NEXT_PUBLIC_CBBTC_ADDRESS || "",
    },
    webpack: (config) => {
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            // MetaMask SDK expects this React Native module even in browser builds.
            // We don't rely on MetaMask SDK connector; this shim keeps builds clean.
            "@react-native-async-storage/async-storage": path.resolve(
                __dirname,
                "shims/async-storage.js"
            ),
        };
        return config;
    },
};

module.exports = nextConfig;
