export interface RetryOptions {
    retries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    label?: string;
    shouldRetry?: (err: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
    const j = ms * 0.2;
    return Math.max(0, Math.floor(ms - j + Math.random() * (2 * j)));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
    const { retries, baseDelayMs, maxDelayMs, shouldRetry } = opts;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            const canRetry = attempt <= retries && (shouldRetry ? shouldRetry(err) : true);
            if (!canRetry) throw err;
            const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            await sleep(jitter(delay));
        }
    }
}

