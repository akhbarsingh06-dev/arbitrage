import axios from "axios";
import { createLogger } from "./logger";
import { config, PairConfig } from "./config";

const log = createLogger("Discovery");

export interface GeckoPool {
    id: string;
    attributes: {
        address: string;
        name: string;
        base_token_price_usd: string;
        quote_token_price_usd: string;
        reserve_in_usd: string;
        volume_usd: {
            h24: string;
        };
    };
    relationships: {
        base_token: { data: { id: string } };
        quote_token: { data: { id: string } };
        dex: { data: { id: string } };
    };
}

export class DiscoveryService {
    private static INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    private discoveredPairs: Map<string, PairConfig> = new Map();
    private onPairDiscovered: (pair: PairConfig) => void;

    constructor(onPairDiscovered: (pair: PairConfig) => void) {
        this.onPairDiscovered = onPairDiscovered;
    }

    async start() {
        log.info("Starting discovery service...");
        await this.discover();
        setInterval(() => this.discover(), DiscoveryService.INTERVAL_MS);
    }

    private async discover() {
        try {
            log.info("Checking for new high-liquidity pairs on Base...");

            // Fetch trending pools on Base from GeckoTerminal
            // https://www.geckoterminal.com/dex-api
            const response = await axios.get(
                "https://api.geckoterminal.com/api/v2/networks/base/trending_pools?include=base_token,quote_token,dex",
                { headers: { Accept: "application/json;version=20230302" } }
            );

            const pools = response.data.data as GeckoPool[];
            const included = response.data.included as any[];

            for (const pool of pools) {
                const liquidity = parseFloat(pool.attributes.reserve_in_usd);
                if (liquidity < 5000) continue; // Min $5,000 liquidity

                const dexId = pool.relationships.dex.data.id;
                // Only support Uniswap V3 and Aerodrome for now
                if (!dexId.includes("uniswap-v3") && !dexId.includes("aerodrome")) continue;

                const baseTokenId = pool.relationships.base_token.data.id;
                const quoteTokenId = pool.relationships.quote_token.data.id;

                const baseToken = included.find(i => i.id === baseTokenId && i.type === "token");
                const quoteToken = included.find(i => i.id === quoteTokenId && i.type === "token");

                if (!baseToken || !quoteToken) continue;

                const pairName = `${baseToken.attributes.symbol}/${quoteToken.attributes.symbol}`;

                // If we already monitor this pair or discovered it, skip
                if (config.pairs.some(p => p.name === pairName) || this.discoveredPairs.has(pairName)) continue;

                log.info("Discovered new high-liquidity pair", {
                    pair: pairName,
                    liquidity: `$${liquidity.toFixed(2)}`,
                    dex: dexId
                });

                const newPair: PairConfig = {
                    name: pairName,
                    token0: baseToken.attributes.address,
                    token1: quoteToken.attributes.address,
                    v3Pools: dexId.includes("uniswap-v3") ? [{ dex: "uniswapV3", fee: 3000 }, { dex: "uniswapV3", fee: 10000 }] : [],
                    aerodromePools: dexId.includes("aerodrome") ? [{ stable: false }] : []
                };

                this.discoveredPairs.set(pairName, newPair);
                this.onPairDiscovered(newPair);
            }
        } catch (err: any) {
            log.warn("Discovery failed", { err: err.message });
        }
    }

    getDiscoveredPairs() {
        return Array.from(this.discoveredPairs.values());
    }
}
