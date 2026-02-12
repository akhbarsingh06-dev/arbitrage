#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function nodeMajor() {
  return Number((process.versions.node || "0").split(".")[0]);
}

function ensureSymlinkOrCopy(fromAbs, toAbs) {
  if (fs.existsSync(toAbs)) return;
  const rel = path.relative(path.dirname(toAbs), fromAbs);
  try {
    fs.symlinkSync(rel, toAbs);
  } catch {
    try {
      fs.copyFileSync(fromAbs, toAbs);
    } catch {
      // ignore; will retry next tick
    }
  }
}

function mirrorNextServerChunks(frontendRoot) {
  const serverDir = path.join(frontendRoot, ".next", "server");
  const chunksDir = path.join(serverDir, "chunks");
  if (!fs.existsSync(chunksDir)) return;

  let files;
  try {
    files = fs.readdirSync(chunksDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const fromAbs = path.join(chunksDir, file);
    const toAbs = path.join(serverDir, file);
    ensureSymlinkOrCopy(fromAbs, toAbs);
  }
}

function main() {
  const frontendRoot = path.resolve(__dirname, "..");
  const major = nodeMajor();

  // On some Node versions (notably very new majors), Next dev can emit server chunks
  // under `.next/server/chunks/` while its runtime attempts `require("./<id>.js")`.
  // This mirror keeps compatibility without altering Next internals.
  const enableMirror = major > 20;
  if (enableMirror) {
    console.warn(
      `[dev-wrapper] Node ${process.versions.node} detected. ` +
        `Enabling .next/server chunk mirroring workaround (recommended: Node 20.x).`
    );
    setInterval(() => mirrorNextServerChunks(frontendRoot), 750).unref();
  }

  const nextBin = path.join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
  const args = ["dev", ...process.argv.slice(2)];
  const hook = path.join(frontendRoot, "scripts", "next-require-hook.js");

  const child = spawn(process.execPath, ["-r", hook, nextBin, ...args], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

main();
