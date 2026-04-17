const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    K_FACTOR: 32,
    AGE_FACTOR: 2.5,
    PROGRESSION_FACTOR: 0.1,
    CONFIDENCE_GAIN: 0.1,
    DATA_DIR: path.join(__dirname, '../data/matches'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    OUTPUT_FILE: path.join(__dirname, '../output/rankings_history.json')
};

let ratings = {}; 

const getExpected = (ra, rb) => {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
};

const updateElo = (current, exp, act, multiplier = 1) => {
    const delta = (CONFIG.K_FACTOR * multiplier) * (act - exp);
    return { nextElo: current + delta, delta: delta };
};

async function run() {
    try {
        await fs.mkdir(path.join(__dirname, '../output'), { recursive: true });
        const kingdoms = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
        const files = (await fs.readdir(CONFIG.DATA_DIR))
            .filter(f => f.startsWith('season_') && f.endsWith('.json'))
            .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

        const history = {};

        for (const file of files) {
            const seasonNumber = file.match(/\d+/)[0];
            const matches = JSON.parse(await fs.readFile(path.join(CONFIG.DATA_DIR, file), 'utf8'));
            
            // Temporary storage for deltas in this season
            const seasonLogs = {};

            matches.forEach(m => {
                const { kingdom_a: a, kingdom_b: b, prep_winner: pW, castle_winner: cW, kvk_id } = m;

                const matchDate = new Date(m.season_date);

                if (!ratings[a]) {
                    const ageA = m.kingdom_a_age_days || 0;
                    const initA = 1000 + (ageA * CONFIG.AGE_FACTOR);
                    ratings[a] = { prepElo: initA, castleElo: initA, overallElo: initA, confidence: 0.1, matchesPlayed: 0 };
                }
                if (!seasonLogs[a]) seasonLogs[a] = [];

                if (!ratings[b]) {
                    const ageB = m.kingdom_b_age_days || 0;
                    const initB = 1000 + (ageB * CONFIG.AGE_FACTOR);
                    ratings[b] = { prepElo: initB, castleElo: initB, overallElo: initB, confidence: 0.1, matchesPlayed: 0 };
                }
                if (!seasonLogs[b]) seasonLogs[b] = [];

                // Calculate Deltas
                const isSweepA = (pW == a && cW == a);
                const isSweepB = (pW == b && cW == b);
                const multA = isSweepA ? 1.5 : 1;
                const multB = isSweepB ? 1.5 : 1;

                // Prep Update
                const resP_A = updateElo(ratings[a].prepElo, getExpected(ratings[a].prepElo, ratings[b].prepElo), pW == a ? 1 : 0);
                const resP_B = updateElo(ratings[b].prepElo, getExpected(ratings[b].prepElo, ratings[a].prepElo), pW == b ? 1 : 0);
                
                // Castle Update
                const resC_A = updateElo(ratings[a].castleElo, getExpected(ratings[a].castleElo, ratings[b].castleElo), cW == a ? 1 : 0);
                const resC_B = updateElo(ratings[b].castleElo, getExpected(ratings[b].castleElo, ratings[a].castleElo), cW == b ? 1 : 0);

                // Overall Update
                const actOA = isSweepA ? 1 : (isSweepB ? 0 : 0.5);
                const resO_A = updateElo(ratings[a].overallElo, getExpected(ratings[a].overallElo, ratings[b].overallElo), actOA, multA);
                const resO_B = updateElo(ratings[b].overallElo, getExpected(ratings[b].overallElo, ratings[a].overallElo), 1 - actOA, multB);

                // Log details for history output
                seasonLogs[a].push({ kvk_id, pDelta: resP_A.delta, cDelta: resC_A.delta, oDelta: resO_A.delta });
                seasonLogs[b].push({ kvk_id, pDelta: resP_B.delta, cDelta: resC_B.delta, oDelta: resO_B.delta });

                // Apply Changes
                ratings[a].prepElo = resP_A.nextElo; ratings[a].castleElo = resC_A.nextElo; ratings[a].overallElo = resO_A.nextElo;
                ratings[b].prepElo = resP_B.nextElo; ratings[b].castleElo = resC_B.nextElo; ratings[b].overallElo = resO_B.nextElo;
                
                ratings[a].matchesPlayed++;
                ratings[b].matchesPlayed++;
                
                ratings[a].confidence = Math.min(1.0, ratings[a].confidence + CONFIG.CONFIDENCE_GAIN);
                ratings[b].confidence = Math.min(1.0, ratings[b].confidence + CONFIG.CONFIDENCE_GAIN);
            });

            // Map the logs into the history object
            history[seasonNumber] = JSON.parse(JSON.stringify(ratings));
            Object.keys(history[seasonNumber]).forEach(id => {
                history[seasonNumber][id].match_history = seasonLogs[id] || [];
            });
        }

        await fs.writeFile(CONFIG.OUTPUT_FILE, JSON.stringify(history, null, 2));
        console.log("Rankings history updated with match IDs and deltas.");
    } catch (err) { console.error(err); }
}

run();