const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    AGE_THRESHOLD: 15,
    POOL_SIZE: 5
};

async function scout(targetId) {
    if (!targetId) return console.log("Please provide a Kingdom ID: node scripts/scout.js <ID>");

    try {
        const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
        const kingdoms = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
        
        const seasons = Object.keys(history).sort((a,b) => b - a);
        const stats = history[seasons[0]]; // Get latest season

        if (!stats[targetId]) {
            return console.log(`Error: Kingdom ${targetId} not found in the latest rankings. They might be too new.`);
        }

        const targetAge = kingdoms[targetId] ? new Date(kingdoms[targetId]) : new Date();
        const targetElo = stats[targetId].overallElo || 1000;

        const neighborhood = Object.keys(stats).filter(id => {
            if (id == targetId) return false;
            const kAge = kingdoms[id] ? new Date(kingdoms[id]) : new Date();
            const ageDiff = Math.abs((kAge - targetAge) / (1000 * 60 * 60 * 24));
            return ageDiff <= CONFIG.AGE_THRESHOLD;
        });

        const potentialOpponents = neighborhood.map(id => ({
            id,
            elo: stats[id].overallElo,
            diff: Math.abs(stats[id].overallElo - targetElo)
        })).sort((a, b) => a.diff - b.diff);

        console.log(`\nSCOUTING REPORT: Kingdom ${targetId} (Elo: ${targetElo.toFixed(0)})`);
        console.log(`Potential Opponents in Age Bracket (+/- ${CONFIG.AGE_THRESHOLD} days):`);
        potentialOpponents.slice(0, CONFIG.POOL_SIZE).forEach((k, i) => {
            console.log(`${i+1}. Kingdom ${k.id.toString().padEnd(5)} | Elo: ${k.elo.toFixed(0)} | Delta: ${k.diff.toFixed(0)}`);
        });

    } catch (err) { console.error("Scout Error:", err.message); }
}
scout(process.argv[2]);