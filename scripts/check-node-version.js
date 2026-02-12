#!/usr/bin/env node
const major = Number((process.versions.node || "0").split(".")[0]);
const strict = String(process.env.STRICT_NODE_VERSION || "").toLowerCase() === "true";

// Next.js 14 + Hardhat are most stable on Node 18/20 LTS.
if (Number.isNaN(major) || major < 18 || major > 20) {
  const msg =
    `[node] Unsupported Node.js version: ${process.versions.node}. ` +
    `Recommended: Node 20.x (or 18.x LTS). See .nvmrc.`;
  // eslint-disable-next-line no-console
  if (strict) console.error(msg);
  else console.warn(msg);
  if (strict) process.exit(1);
}
