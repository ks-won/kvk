const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    DATA_DIR: path.join(__dirname, '../data/matches'),
    REPORT_FILE: path.join(__dirname, '../output/distribution_report.txt')
};

async function analyze() {
    const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
    const kingdoms = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
    let report = `DEEP ECOSYSTEM ANALYSIS\n=======================\n`;

    for (const s of Object.keys(history).sort((a,b)=>a-b)) {
        const pool = Object.values(history[s]);
        const overScores = pool.map(k => k.overallElo).sort((a,b) => a-b);
        
        // Specialist Logic (0.3 Percentile Divergence)
        const farmers = pool.filter(k => (k.prepElo - k.castleElo) > 200).length;
        const warriors = pool.filter(k => (k.castleElo - k.prepElo) > 200).length;

        report += `\nSEASON ${s}:\n`;
        report += `  - Population:  ${pool.length} kingdoms\n`;
        report += `  - Elo Spread:  ${overScores[0].toFixed(0)} to ${overScores[overScores.length-1].toFixed(0)}\n`;
        report += `  - Specialists: ${farmers} Farmers vs ${warriors} Warriors\n`;
        report += `  - Convergence: ${getCorrelation(pool, 'prepElo', 'castleElo').toFixed(3)} (1.0 = All-rounders)\n`;
    }

    await fs.writeFile(CONFIG.REPORT_FILE, report);
}

function getCorrelation(data, k1, k2) {
    const n = data.length;
    let [sx, sy, sxy, sx2, sy2] = [0,0,0,0,0];
    for (const d of data) {
        sx += d[k1]; sy += d[k2]; sxy += (d[k1]*d[k2]); sx2 += (d[k1]**2); sy2 += (d[k2]**2);
    }
    const den = Math.sqrt((n * sx2 - sx**2) * (n * sy2 - sy**2));
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

analyze();