const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    K_FACTOR: 32,
    AGE_FACTOR: 2.5,          // Used for initial seeding (1000 + age * 2.5)
    VIRTUAL_AGE_ELO: 3.5,     // Each day of age difference acts like 3.5 Elo points in 'Expectation'
    TREND_SENSITIVITY: 0.005, // How much matchmaking trends (slope) affect K-Factor
    PROGRESSION_FACTOR: 0.1,
    CONFIDENCE_GAIN: 0.1,
    DATA_DIR: path.join(__dirname, '../data/matches'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    OUTPUT_FILE: path.join(__dirname, '../output/rankings_history.json')
};

let ratings = {}; 

/**
 * Calculates a linear regression slope for trend detection.
 * Determines if opponent quality is rising or falling.
 */
function calculateSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumXX += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

/**
 * Expected score calculation factoring in Age Pressure.
 * If ageB > ageA, Kingdom A is the underdog and receives more points for a win.
 */
const getExpected = (ra, rb, ageA, ageB) => {
    const ageDiff = ageB - ageA;
    const ageHandicap = ageDiff * CONFIG.VIRTUAL_AGE_ELO;
    // We treat Kingdom B as having (rb + ageHandicap) for the purpose of expectation
    return 1 / (1 + Math.pow(10, ((rb + ageHandicap) - ra) / 400));
};

/**
 * Updates Elo using a trend-adjusted K-Factor.
 */
const updateElo = (current, exp, act, multiplier = 1, trendMult = 1) => {
    const adjustedK = CONFIG.K_FACTOR * multiplier * trendMult;
    const delta = adjustedK * (act - exp);
    return { nextElo: current + delta, delta: delta };
};

async function run() {
    try {
        await fs.mkdir(path.join(__dirname, '../output'), { recursive: true });
        
        // Ensure data exists
        const kingdoms = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
        const files = (await fs.readdir(CONFIG.DATA_DIR))
            .filter(f => f.startsWith('season_') && f.endsWith('.json'))
            .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

        const history = {};

        for (const file of files) {
            const seasonNumber = file.match(/\d+/)[0];
            const matches = JSON.parse(await fs.readFile(path.join(CONFIG.DATA_DIR, file), 'utf8'));
            
            const seasonLogs = {};
            const seasonOpponentStats = {};

            matches.forEach(m => {
                const { 
                    kingdom_a: a, 
                    kingdom_b: b, 
                    kingdom_a_age_days: ageA, 
                    kingdom_b_age_days: ageB,
                    prep_winner: pW, 
                    castle_winner: cW, 
                    kvk_id 
                } = m;

                // Initialize Kingdoms deterministically
                [ {id: a, age: ageA}, {id: b, age: ageB} ].forEach(k => {
                    if (!ratings[k.id]) {
                        const initVal = 1000 + (k.age * CONFIG.AGE_FACTOR);
                        ratings[k.id] = { 
                            prepElo: initVal, castleElo: initVal, overallElo: initVal, 
                            confidence: 0.1, matchesPlayed: 0, 
                            oppEloHistory: [] 
                        };
                    }
                    if (!seasonLogs[k.id]) seasonLogs[k.id] = [];
                    if (!seasonOpponentStats[k.id]) seasonOpponentStats[k.id] = [];
                });

                // 1. Calculate Matchmaking Trend for both kingdoms
                const trendMultA = Math.max(0.5, 1 + (calculateSlope(ratings[a].oppEloHistory) * CONFIG.TREND_SENSITIVITY));
                const trendMultB = Math.max(0.5, 1 + (calculateSlope(ratings[b].oppEloHistory) * CONFIG.TREND_SENSITIVITY));

                // 2. Track opponent strength for future seasons
                seasonOpponentStats[a].push(ratings[b].overallElo);
                seasonOpponentStats[b].push(ratings[a].overallElo);

                // 3. Calculate Expected Scores with Age Pressure
                const expPrepA = getExpected(ratings[a].prepElo, ratings[b].prepElo, ageA, ageB);
                const expCastA = getExpected(ratings[a].castleElo, ratings[b].castleElo, ageA, ageB);
                const expOverA = getExpected(ratings[a].overallElo, ratings[b].overallElo, ageA, ageB);

                // 4. Determine Actual Outcomes
                const isSweepA = (pW == a && cW == a);
                const isSweepB = (pW == b && cW == b);
                const multA = isSweepA ? 1.5 : 1;
                const multB = isSweepB ? 1.5 : 1;
                const actOverA = isSweepA ? 1 : (isSweepB ? 0 : 0.5);

                // 5. Compute Deltas
                const resP_A = updateElo(ratings[a].prepElo, expPrepA, pW == a ? 1 : 0, 1, trendMultA);
                const resP_B = updateElo(ratings[b].prepElo, 1 - expPrepA, pW == b ? 1 : 0, 1, trendMultB);
                
                const resC_A = updateElo(ratings[a].castleElo, expCastA, cW == a ? 1 : 0, 1, trendMultA);
                const resC_B = updateElo(ratings[b].castleElo, 1 - expCastA, cW == b ? 1 : 0, 1, trendMultB);

                const resO_A = updateElo(ratings[a].overallElo, expOverA, actOverA, multA, trendMultA);
                const resO_B = updateElo(ratings[b].overallElo, 1 - expOverA, 1 - actOverA, multB, trendMultB);

                // 6. Log results
                seasonLogs[a].push({ kvk_id, pDelta: resP_A.delta, cDelta: resC_A.delta, oDelta: resO_A.delta });
                seasonLogs[b].push({ kvk_id, pDelta: resP_B.delta, cDelta: resC_B.delta, oDelta: resO_B.delta });

                // 7. Apply Updates
                ratings[a].prepElo = resP_A.nextElo; ratings[a].castleElo = resC_A.nextElo; ratings[a].overallElo = resO_A.nextElo;
                ratings[b].prepElo = resP_B.nextElo; ratings[b].castleElo = resC_B.nextElo; ratings[b].overallElo = resO_B.nextElo;
                
                ratings[a].matchesPlayed++;
                ratings[b].matchesPlayed++;
                ratings[a].confidence = Math.min(1.0, ratings[a].confidence + CONFIG.CONFIDENCE_GAIN);
                ratings[b].confidence = Math.min(1.0, ratings[b].confidence + CONFIG.CONFIDENCE_GAIN);
            });

            // Post-season: Record average opponent strength for trend analysis in next season
            Object.keys(seasonOpponentStats).forEach(id => {
                if (seasonOpponentStats[id].length > 0) {
                    const avgOpp = seasonOpponentStats[id].reduce((sum, v) => sum + v, 0) / seasonOpponentStats[id].length;
                    ratings[id].oppEloHistory.push(avgOpp);
                }
            });

            // Map logs to history object
            history[seasonNumber] = JSON.parse(JSON.stringify(ratings));
            Object.keys(history[seasonNumber]).forEach(id => {
                history[seasonNumber][id].match_history = seasonLogs[id] || [];
            });
        }

        await fs.writeFile(CONFIG.OUTPUT_FILE, JSON.stringify(history, null, 2));
        console.log(`Ranker complete. Processed ${files.length} seasons.`);
        console.log(`Variation added via Age Pressure (Factor: ${CONFIG.VIRTUAL_AGE_ELO}) and Matchmaking Trends.`);

    } catch (err) {
        console.error("Error during ranking process:", err);
    }
}

run();