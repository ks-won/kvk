const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    DATA_DIR: path.join(__dirname, '../data/matches'),
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    REPORT_FILE: path.join(__dirname, '../output/fitness_report.txt'),
    AGE_BRACKET: 7 // Based on 4.9 day fingerprint
};

const getExpected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

async function evaluate() {
    try {
        const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
        const kingdoms = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
        const seasons = Object.keys(history).sort((a,b) => parseInt(a) - parseInt(b));
        
        let report = `FINAL SYSTEM EVALUATION\n=======================\n\n`;
        report += `Season | Prep Acc | Cast Acc | Over Fit | Match Predictability\n`;
        report += `-------|----------|----------|----------|---------------------\n`;

        for (let i = 1; i < seasons.length; i++) {
            const prevS = seasons[i-1];
            const currS = seasons[i];
            const matches = JSON.parse(await fs.readFile(path.join(CONFIG.DATA_DIR, `season_${currS}.json`), 'utf8'));
            
            let stats = { count: 0, pAcc: 0, cAcc: 0, oFit: 0, mPred: 0 };

            matches.forEach(m => {
                const [a, b] = [m.kingdom_a, m.kingdom_b];
                if (!history[prevS][a] || !history[prevS][b]) return;
                stats.count++;

                // 1. Elo Accuracy
                const expC = getExpected(history[prevS][a].castleElo, history[prevS][b].castleElo);
                if ((expC > 0.5) === (m.castle_winner == a)) stats.cAcc++;
                
                const expP = getExpected(history[prevS][a].prepElo, history[prevS][b].prepElo);
                if ((expP > 0.5) === (m.prep_winner == a)) stats.pAcc++;

                stats.oFit += (1 - Math.pow(((m.prep_winner == a && m.castle_winner == a) ? 1 : 0.5) - getExpected(history[prevS][a].overallElo, history[prevS][b].overallElo), 2));

                // 2. Matchmaking Predictability (Is B in A's Age/Elo neighborhood?)
                const ageA = new Date(kingdoms[a]);
                const localPeers = Object.entries(history[prevS])
                    .filter(([id, _]) => Math.abs((new Date(kingdoms[id]) - ageA) / 86400000) <= CONFIG.AGE_BRACKET)
                    .map(([id, s]) => ({ id: parseInt(id), elo: s.overallElo }))
                    .sort((a,b) => b.elo - a.elo);
                
                const idxA = localPeers.findIndex(p => p.id === a);
                const neighbors = localPeers.slice(Math.max(0, idxA-3), idxA+4).map(p => p.id);
                if (neighbors.includes(b)) stats.mPred++;
            });

            const fmt = (v) => (v/stats.count*100).toFixed(1) + '%';
            report += `${currS.padEnd(6)} | ${fmt(stats.pAcc).padEnd(8)} | ${fmt(stats.cAcc).padEnd(8)} | ${fmt(stats.oFit).padEnd(8)} | ${fmt(stats.mPred)}\n`;
        }

        await fs.writeFile(CONFIG.REPORT_FILE, report);
        console.log("Evaluation complete.");
    } catch (err) { console.error(err); }
}
evaluate();