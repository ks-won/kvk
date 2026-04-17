const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    DATA_DIR: path.join(__dirname, '../data/matches'),
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    REPORT_FILE: path.join(__dirname, '../output/fitness_report.txt'),
    UPSET_THRESHOLD: 50 // Minimum Elo difference to consider a kingdom a "clear favorite"
};

const getExpected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const getLogLoss = (exp, actual) => {
    const eps = 1e-15;
    const p = Math.max(eps, Math.min(1 - eps, exp));
    return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
};

async function evaluate() {
    try {
        const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
        const seasons = Object.keys(history).sort((a,b) => parseInt(a) - parseInt(b));
        
        const statsMap = {};

        for (let i = 1; i < seasons.length; i++) {
            const prevS = seasons[i-1];
            const currS = seasons[i];
            let matches;
            try {
                matches = JSON.parse(await fs.readFile(path.join(CONFIG.DATA_DIR, `season_${currS}.json`), 'utf8'));
            } catch (e) { continue; }

            matches.forEach(m => {
                const [a, b] = [m.kingdom_a, m.kingdom_b];
                const rA = history[prevS][a];
                const rB = history[prevS][b];
                
                if (!rA || !rB) return;

                const expLevel = Math.min(rA.matchesPlayed, rB.matchesPlayed);

                if (!statsMap[expLevel]) {
                    statsMap[expLevel] = {
                        count: 0,
                        prep: { acc: 0, brier: 0, logLoss: 0, upsets: 0, sigMatches: 0 },
                        castle: { acc: 0, brier: 0, logLoss: 0, upsets: 0, sigMatches: 0 },
                        overall: { acc: 0, brier: 0, logLoss: 0, upsets: 0, sigMatches: 0 }
                    };
                }

                const s = statsMap[expLevel];
                s.count++;

                const outP = m.prep_winner == a ? 1 : 0;
                const outC = m.castle_winner == a ? 1 : 0;
                const outO = (outP + outC) / 2;

                const expP = getExpected(rA.prepElo, rB.prepElo);
                const expC = getExpected(rA.castleElo, rB.castleElo);
                const expO = getExpected(rA.overallElo, rB.overallElo);

                const phases = [
                    { key: 'prep', exp: expP, act: outP, diff: Math.abs(rA.prepElo - rB.prepElo) },
                    { key: 'castle', exp: expC, act: outC, diff: Math.abs(rA.castleElo - rB.castleElo) },
                    { key: 'overall', exp: expO, act: outO, diff: Math.abs(rA.overallElo - rB.overallElo) }
                ];

                phases.forEach(p => {
                    // Accuracy
                    if ((p.exp > 0.5 && p.act > 0.5) || (p.exp < 0.5 && p.act < 0.5)) s[p.key].acc++;
                    
                    // Error Metrics
                    s[p.key].brier += Math.pow(p.exp - p.act, 2);
                    s[p.key].logLoss += getLogLoss(p.exp, p.act);

                    // Upset Logic
                    if (p.diff >= CONFIG.UPSET_THRESHOLD) {
                        s[p.key].sigMatches++;
                        // If the favorite (exp > 0.5) loses (act < 0.5) or vice versa
                        if ((p.exp > 0.5 && p.act < 0.5) || (p.exp < 0.5 && p.act > 0.5)) {
                            s[p.key].upsets++;
                        }
                    }
                });
            });
        }

        let report = `## GRANULAR FITNESS BY MATCH COUNT\n\n`;
        report += `| Exp | Count | Phase    | Acc   | Brier | Log Loss | Upset Rate |\n`;
        //report += `----|-------|----------|-------|-------|----------|-----------\n`;

        const sortedLevels = Object.keys(statsMap).sort((a, b) => parseInt(a) - parseInt(b));

        sortedLevels.forEach(lvl => {
            const s = statsMap[lvl];
            const fmtAcc = (v, total = s.count) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
            const fmtVal = (v) => (v / s.count).toFixed(3);

            report += `${lvl.toString().padEnd(3)} | ${s.count.toString().padEnd(5)} | OVERALL  | ${fmtAcc(s.overall.acc).padEnd(5)} | ${fmtVal(s.overall.brier)} | ${fmtVal(s.overall.logLoss).padEnd(8)} | ${fmtAcc(s.overall.upsets, s.overall.sigMatches)} |\n`;
            report += `|     |       | PREP     | ${fmtAcc(s.prep.acc).padEnd(5)} | ${fmtVal(s.prep.brier)} | ${fmtVal(s.prep.logLoss).padEnd(8)} | ${fmtAcc(s.prep.upsets, s.prep.sigMatches)} |\n`;
            report += `|     |       | CASTLE   | ${fmtAcc(s.castle.acc).padEnd(5)} | ${fmtVal(s.castle.brier)} | ${fmtVal(s.castle.logLoss).padEnd(8)} | ${fmtAcc(s.castle.upsets, s.castle.sigMatches)} |\n`;
            //report += `----|-------|----------|-------|-------|----------|-----------\n`;
        });

        report += `\n\n## METRIC INTERPRETATION GUIDE\n` + "=".repeat(60) + `\n`;
        
        report += `1. ACCURACY (The "Winner" Check)\n`;
        report += `   The % of matches where the kingdom with the higher Elo won.\n`;
        report += `   - 50.0%: No better than a coin flip.\n`;
        report += `   - 65% - 75%: Healthy. Skill and prep matter, but upsets happen.\n`;
        report += `   - > 85%: The "Stat-Check" Zone. The stronger kingdom almost always wins,\n`;
        report += `            which can make the game feel deterministic or boring.\n\n`;

        report += `2. BRIER SCORE (The "Probability" Error)\n`;
        report += `   Measures the squared difference between predicted % and actual result.\n`;
        report += `   - 0.000: Perfect prediction (100% sure and 100% right).\n`;
        report += `   - 0.250: The "Guessing" threshold (50/50 prediction for every match).\n`;
        report += `   - Lower is better. Unlike accuracy, this rewards the system for being\n`;
        report += `     "cautious" about close matches and "confident" about stomps.\n\n`;

        report += `3. LOG LOSS (The "Confidence Penalty")\n`;
        report += `   Heavily penalizes the system for being "Confident and Wrong."\n`;
        report += `   - < 0.500: High reliability. The system's Elo gaps match reality.\n`;
        report += `   - 0.693: The threshold where the system is effectively just guessing.\n`;
        report += `   - > 0.800: Poor. Often caused by "Provisional" kingdoms having the\n`;
        report += `              wrong Elo, leading to massive unexpected upsets.\n\n`;

        report += `4. UPSET RATE (The "Underdog" Metric)\n`;
        report += `   The % of matches where a kingdom with at least a ${CONFIG.UPSET_THRESHOLD}pt Elo\n`;
        report += `   disadvantage managed to win.\n`;
        report += `   - High Rate: Indicates a high-skill or high-variance meta where strategy\n`;
        report += `                can overcome a power gap.\n`;
        report += `   - Low Rate: Indicates that raw power/stats are the only thing that matters.\n`;

        await fs.writeFile(CONFIG.REPORT_FILE, report);
        console.log("Granular fitness evaluation with full metric guide complete.");
    } catch (err) { console.error(err); }
}

evaluate();