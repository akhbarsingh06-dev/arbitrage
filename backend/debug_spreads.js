const fs = require('fs');
const data = JSON.parse(fs.readFileSync('spreads.json', 'utf8'));

console.log("Found pairs:", data.pairs.length);
const targets = data.pairs.filter(p =>
    p.pair.includes("USDT") ||
    p.pair.includes("AERO") ||
    p.pair.includes("BRETT") ||
    p.pair.includes("DEGEN") ||
    p.pair.includes("TOSHI")
);

if (targets.length === 0) {
    console.log("No USDT or AERO pairs found in spreads.json!");
} else {
    targets.forEach(p => {
        console.log(`\nPair: ${p.pair}`);
        if (p.topRaw && p.topRaw.length > 0) {
            console.log(`  Best Spread: ${p.topRaw[0].netSpreadPercent.toFixed(4)}%`);
            console.log(`  Raw Spread:  ${p.topRaw[0].rawSpreadPercent.toFixed(4)}%`);
            console.log(`  Fee Impact:  ${p.topRaw[0].feePercent.toFixed(4)}%`);
            console.log(`  Route:       ${p.topRaw[0].buyDex} -> ${p.topRaw[0].sellDex}`);
        } else {
            console.log("  No spreads detected (liquidity issues?)");
        }
    });
}
