import { ethers } from "ethers";
import { withRetry } from "./retry";

export class NonceManager {
    private provider: ethers.Provider;
    private address: string;
    private nextNonce: number | null = null;

    constructor(provider: ethers.Provider, address: string) {
        this.provider = provider;
        this.address = address;
    }

    async init(): Promise<void> {
        const n = await withRetry(
            () => this.provider.getTransactionCount(this.address, "pending"),
            { retries: 3, baseDelayMs: 250, maxDelayMs: 2000, label: "getTransactionCount" }
        );
        this.nextNonce = n;
    }

    async getNonce(): Promise<number> {
        if (this.nextNonce === null) await this.init();
        return this.nextNonce as number;
    }

    markUsed(nonce: number): void {
        if (this.nextNonce === null) {
            this.nextNonce = nonce + 1;
            return;
        }
        if (this.nextNonce <= nonce) {
            this.nextNonce = nonce + 1;
        }
    }

    async reset(): Promise<void> {
        this.nextNonce = null;
        await this.init();
    }
}
