// Workaround for certain Next.js dev builds on very new Node majors:
// webpack runtime may `require("./<chunkId>.js")` from `.next/server/`,
// while the file is emitted under `.next/server/chunks/<chunkId>.js`.
//
// This hook makes Node fall back to the `chunks/` folder for numeric chunk files.
//
// Loaded by `frontend/scripts/dev-wrapper.js` via `-r`.
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const Module = require("module");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    const e = err;
    if (!e || e.code !== "MODULE_NOT_FOUND") throw err;

    if (typeof request !== "string") throw err;
    if (!request.startsWith("./")) throw err;
    if (!/^\.\/*\d+\.js$/.test(request)) throw err;
    if (!parent || typeof parent.filename !== "string") throw err;
    if (!parent.filename.includes(`${path.sep}.next${path.sep}server${path.sep}`)) throw err;

    const base = path.basename(request); // "1682.js"
    const candidate = path.join(path.dirname(parent.filename), "chunks", base);
    if (fs.existsSync(candidate)) return candidate;

    throw err;
  }
};

