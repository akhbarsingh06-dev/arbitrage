import { ethers } from "ethers";
import { config } from "./config";
import { createLogger } from "./logger";

function uniq(arr: string[]): string[] {
    return Array.from(new Set(arr));
}

const log = createLogger("Providers");

export function getRpcUrls(): string[] {
    // Ensure primary RPC is tried first.
    // Always include Base's free public RPC as a last-resort fallback (zero-cost infra).
    const urls = [config.rpcUrl, ...config.rpcUrls, "https://mainnet.base.org"].filter(Boolean);
    return uniq(urls);
}

export function getWsUrls(): string[] {
    const urls = [
        ...config.wsUrls,
        config.wsUrl,
    ].filter(Boolean);
    return uniq(urls);
}

export function createRpcProvider(): ethers.JsonRpcProvider {
    const urls = getRpcUrls();
    const network = ethers.Network.from({ name: "base", chainId: config.chainId });
    // NOTE: Avoid ethers.FallbackProvider here. On some public RPC combos it can throw
    // `network changed: 1 => 8453` during network detection. We'll do manual fallback
    // for read-heavy paths instead.
    return new ethers.JsonRpcProvider(urls[0], network, { staticNetwork: network });
}

// Use a single primary RPC for transaction submission to avoid inconsistent nonce/mempool across backends.
export function createTxProvider(): ethers.JsonRpcProvider {
    const urls = getRpcUrls();
    const network = ethers.Network.from({ name: "base", chainId: config.chainId });
    return new ethers.JsonRpcProvider(urls[0], network, { staticNetwork: network });
}

export function createWsProvider(url: string): ethers.WebSocketProvider {
    const network = ethers.Network.from({ name: "base", chainId: config.chainId });
    return new ethers.WebSocketProvider(url, network);
}

let cachedReadProviders: ethers.JsonRpcProvider[] | null = null;
let cachedHealthyReadProviders: ethers.JsonRpcProvider[] | null = null;
let healthCheckInFlight: Promise<ethers.JsonRpcProvider[]> | null = null;

export function getReadProviders(): ethers.JsonRpcProvider[] {
    if (cachedReadProviders) return cachedReadProviders;
    const urls = getRpcUrls();
    const network = ethers.Network.from({ name: "base", chainId: config.chainId });
    cachedReadProviders = urls.map((u) => new ethers.JsonRpcProvider(u, network, { staticNetwork: network }));
    return cachedReadProviders;
}

async function isProviderHealthy(p: ethers.JsonRpcProvider, timeoutMs: number): Promise<boolean> {
    try {
        const ok = await Promise.race([
            p.getBlockNumber().then(() => true).catch(() => false),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);
        return ok;
    } catch {
        return false;
    }
}

async function getHealthyReadProviders(): Promise<ethers.JsonRpcProvider[]> {
    if (cachedHealthyReadProviders) return cachedHealthyReadProviders;
    if (healthCheckInFlight) return healthCheckInFlight;

    const timeoutMs = Math.max(250, Number(process.env.RPC_HEALTHCHECK_TIMEOUT_MS || "1500"));
    const skip = String(process.env.SKIP_RPC_HEALTHCHECK || "").toLowerCase() === "true";

    healthCheckInFlight = (async () => {
        const providers = getReadProviders();
        if (skip) {
            cachedHealthyReadProviders = providers;
            return providers;
        }

        const checks = await Promise.all(
            providers.map(async (p) => ({ p, ok: await isProviderHealthy(p, timeoutMs) }))
        );
        const healthy = checks.filter((x) => x.ok).map((x) => x.p);

        if (healthy.length === 0) {
            log.warn("RPC healthcheck: no healthy providers; using primary only", { timeoutMs });
            cachedHealthyReadProviders = [providers[0]];
            return cachedHealthyReadProviders;
        }

        cachedHealthyReadProviders = healthy;
        log.info("RPC healthcheck", { healthy: healthy.length, total: providers.length, timeoutMs });
        return healthy;
    })().finally(() => {
        healthCheckInFlight = null;
    });

    return healthCheckInFlight;
}

export async function callWithFallback<T>(fn: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    const providers = await getHealthyReadProviders();
    let lastErr: unknown;
    for (const p of providers) {
        try {
            return await fn(p);
        } catch (err) {
            lastErr = err;
            // try next provider
        }
    }
    throw lastErr;
}
