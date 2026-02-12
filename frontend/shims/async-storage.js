// Minimal browser-safe shim for the React Native async-storage module.
// This is only used to satisfy optional imports inside MetaMask SDK during bundling.
async function getItem() {
  return null;
}

async function setItem() {}

async function removeItem() {}

module.exports = { getItem, setItem, removeItem, default: { getItem, setItem, removeItem } };

