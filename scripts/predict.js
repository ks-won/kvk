const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
};

const getWinProbability = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

async function predict(idA, idB) {
    try {
        const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
        const latestSeason = Object.keys(history).sort((a,b) => b - a)[0];
        const stats = history[latestSeason];

        const kA = stats[idA];
        const kB = stats[idB];

        if (!kA || !kB) {
            console.error("One or both Kingdom IDs not found in latest rankings.");
            return;
        }

        const probs = {
            prep: getWinProbability(kA.prepElo, kB.prepElo),
            castle: getWinProbability(kA.castleElo, kB.castleElo),
            overall: getWinProbability(kA.overallElo, kB.overallElo)
        };

        console.log(`\nPREDICTION: Kingdom ${idA} vs Kingdom ${idB}`);
        console.log(`Confidence: A(${(kA.confidence*100).toFixed(0)}%) | B(${(kB.confidence*100).toFixed(0)}%)`);
        console.log(`---------------------------------------------`);
        console.log(`Prep Phase Win Chance:    ${(probs.prep * 100).toFixed(1)}%`);
        console.log(`Castle Phase Win Chance:  ${(probs.castle * 100).toFixed(1)}%`);
        console.log(`Sweep (Overall) Chance:   ${(probs.overall * 100).toFixed(1)}%`);
        
        if (Math.abs(kA.overallElo - kB.overallElo) < 50) {
            console.log(`\nNote: This is a "Toss-up" match. Elo difference is negligible.`);
        }

    } catch (err) { console.error(err); }
}

// Example usage: node scripts/predict.js 1 15
const args = process.argv.slice(2);
predict(args[0], args[1]);