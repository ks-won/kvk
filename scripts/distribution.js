const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    REPORT_FILE: path.join(__dirname, '../output/distribution_report.txt')
};

// Statistical Helper Functions
const getMean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const getStdDev = (arr, mean) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
const getPercentile = (arr, p) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    return sorted[base];
};

const getSkewness = (arr, mean, stdDev) => {
    const n = arr.length;
    const m3 = arr.reduce((a, b) => a + Math.pow(b - mean, 3), 0) / n;
    return m3 / Math.pow(stdDev, 3);
};

async function analyze() {
    const history = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
    let report = `DEEP ECOSYSTEM ANALYSIS\n=======================\n`;
    let prevMean = null;

    for (const s of Object.keys(history).sort((a, b) => a - b)) {
        const pool = Object.values(history[s]);
        const overScores = pool.map(k => k.overallElo).sort((a, b) => a - b);
        
        const mean = getMean(overScores);
        const median = getPercentile(overScores, 0.5);
        const stdDev = getStdDev(overScores, mean);
        const skew = getSkewness(overScores, mean, stdDev);
        const q1 = getPercentile(overScores, 0.25);
        const q3 = getPercentile(overScores, 0.75);
        
        // Top 10% vs Bottom 10% Gap
        const top10 = overScores.slice(-Math.ceil(overScores.length * 0.1));
        const bot10 = overScores.slice(0, Math.ceil(overScores.length * 0.1));
        const eliteGap = getMean(top10) - getMean(bot10);

        // Specialist Logic
        const farmers = pool.filter(k => (k.prepElo - k.castleElo) > 80).length;
        const warriors = pool.filter(k => (k.castleElo - k.prepElo) > 80).length;

        report += `\n## SEASON ${s}:\n`;
        report += `  - Population:     ${pool.length} kingdoms\n`;
        report += `  - Centrality:     Mean: ${mean.toFixed(1)} | Median: ${median.toFixed(1)}\n`;
        report += `  - Inflation:      ${prevMean ? (mean - prevMean).toFixed(2) : 'N/A'} pts from prev season\n`;
        report += `  - Spread/StdDev:  ${stdDev.toFixed(2)} (High = wide skill gap)\n`;
        report += `  - Mid 50% Range:  ${q1.toFixed(0)} to ${q3.toFixed(0)} (IQR: ${(q3 - q1).toFixed(1)})\n`;
        report += `  - Elite Gap:      ${eliteGap.toFixed(1)} pts (Top 10% vs Bottom 10%)\n`;
        report += `  - Skewness:       ${skew.toFixed(3)} (${skew > 0 ? 'Top-heavy' : 'Bottom-heavy'})\n`;
        report += `  - Specialists:    ${farmers} Farmers vs ${warriors} Warriors\n`;
        report += `  - Convergence:    ${getCorrelation(pool, 'prepElo', 'castleElo').toFixed(3)} (1.0 = All-rounders)\n`;
        
        prevMean = mean;
    }

	// Append the Metric Interpretation Guide
    report += `\n\n---\n`;
    report += `## HOW TO READ THIS REPORT\n\n`;
    report += `\n1. CENTRALITY (Mean & Median)\n`;
    report += `   - Mean: The average Elo. Median: The middle-most kingdom.\n`;
    report += `   - If Mean > Median, a few elite kingdoms are pulling the average up.\n`;
    report += `\n2. INFLATION (Seasonal Change)\n`;
    report += `   - Shows how many points are entering the system. Normal growth is 5-10pts.\n`;
    report += `   - High inflation (20+) means old rankings are losing their relative value.\n`;
    report += `\n3. SPREAD (StdDev)\n`;
    report += `   - High StdDev = A massive gap between the strongest and weakest.\n`;
    report += `   - Low StdDev = A very competitive, tight-knit group where anyone can win.\n`;
    report += `\n4. ELITE GAP (Top 10% vs Bottom 10%)\n`;
    report += `   - The "Distance" between the gods and the casuals. If this grows every\n`;
    report += `     season, the top kingdoms are becoming "unbeatable" by the rest.\n`;
    report += `\n5. SKEWNESS\n`;
    report += `   - Positive (>0): Most kingdoms are low-rank, with a few elite leaders.\n`;
    report += `   - Negative (<0): Most kingdoms are high-rank, with a few laggards.\n`;
    report += `\n6. MIDDLE 50% (IQR)\n`;
    report += `   - The "Mainstream" range. If you are in this bracket, you are average.\n`;
    report += `   - If you are above this range, you are considered "High Tier."\n`;
    report += `\n7. CONVERGENCE (Correlation)\n`;
    report += `   - 1.0 means if you are good at Prep, you are equally good at Combat.\n`;
    report += `   - Low scores (<0.4) mean the two phases require totally different skills.\n`;

    await fs.writeFile(CONFIG.REPORT_FILE, report);
    console.log("Analysis complete. Check distribution_report.txt");
}

function getCorrelation(data, k1, k2) {
    const n = data.length;
    if (n < 2) return 1.0;
    const x = data.map(d => d[k1]);
    const y = data.map(d => d[k2]);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + (b * y[i]), 0);
    const sumX2 = x.reduce((a, b) => a + (b * b), 0);
    const sumY2 = y.reduce((a, b) => a + (b * b), 0);
    const num = (n * sumXY) - (sumX * sumY);
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
}

analyze();