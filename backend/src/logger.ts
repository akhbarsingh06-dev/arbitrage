export type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

export interface Logger {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}

function shouldLog(current: LogLevel, target: LogLevel): boolean {
    return levelRank[target] >= levelRank[current];
}

export function createLogger(name: string, level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info"): Logger {
    const base = { name };
    function log(lvl: LogLevel, msg: string, meta?: Record<string, unknown>) {
        if (!shouldLog(level, lvl)) return;
        const line = {
            t: new Date().toISOString(),
            level: lvl,
            ...base,
            msg,
            ...(meta ? { meta } : {}),
        };
        const out = JSON.stringify(line);
        // eslint-disable-next-line no-console
        if (lvl === "error") console.error(out);
        else if (lvl === "warn") console.warn(out);
        else console.log(out);
    }

    return {
        debug: (msg, meta) => log("debug", msg, meta),
        info: (msg, meta) => log("info", msg, meta),
        warn: (msg, meta) => log("warn", msg, meta),
        error: (msg, meta) => log("error", msg, meta),
    };
}

