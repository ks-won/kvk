const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    MATCH_DIR: path.join(__dirname, '../data/matches'),
    KINGDOMS_FILE: path.join(__dirname, '../data/kingdoms.json'),
    TRANSFERS_FILE: path.join(__dirname, '../data/transfer.json'),
    RANKINGS_FILE: path.join(__dirname, '../output/rankings_history.json'),
    OUTPUT_FILE: path.join(__dirname, '../web/data.json')
};

async function assemble() {
    try {
        console.log("🚀 Starting Data Assembly...");

        // 1. Load All Data Sources
        const kingdomsRaw = JSON.parse(await fs.readFile(CONFIG.KINGDOMS_FILE, 'utf8'));
        const transfersRaw = JSON.parse(await fs.readFile(CONFIG.TRANSFERS_FILE, 'utf8'));
        const rankingsHistory = JSON.parse(await fs.readFile(CONFIG.RANKINGS_FILE, 'utf8'));
        
        const matchFiles = (await fs.readdir(CONFIG.MATCH_DIR))
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

        // Re-map transfers array into an object indexed by 'number' for the final data.json
        const transfersIndexed = {};
        transfersRaw.forEach(t => {
            const groupsIndexed = {};
            t.groups.forEach(g => {
                groupsIndexed[g.number] = g;
            });
            transfersIndexed[t.number] = {
                date: t.date,
                groups: groupsIndexed
            };
        });

        const data = {
            metadata: { current_season: Object.keys(rankingsHistory).length },
            seasons: {},
            kingdoms: {},
            matches: {},
            transfers: transfersIndexed // Now indexed by the explicit .number property
        };

        // 2. Process Seasons (Rankings, Percentiles, and Confidence)
        for (const [sId, sData] of Object.entries(rankingsHistory)) {
            const kIds = Object.keys(sData);
            
            const sortedOverall = [...kIds].sort((a, b) => sData[b].overallElo - sData[a].overallElo);
            const sortedPrep = [...kIds].sort((a, b) => sData[b].prepElo - sData[a].prepElo);
            const sortedCastle = [...kIds].sort((a, b) => sData[b].castleElo - sData[a].castleElo);

            const scoresOverall = sortedOverall.map(id => sData[id].overallElo).reverse();
            const scoresPrep = sortedPrep.map(id => sData[id].prepElo).reverse();
            const scoresCastle = sortedCastle.map(id => sData[id].castleElo).reverse();

            const getPct = (val, list) => Math.round((list.filter(s => s < val).length / list.length) * 100);

            data.seasons[sId] = { date: "2026-01-01", rankings: {} };

            kIds.forEach(kId => {
                const kStats = sData[kId];
                data.seasons[sId].rankings[kId] = {
                    confidence: parseFloat(kStats.confidence.toFixed(2)),
                    prep_elo: { 
                        score: Math.round(kStats.prepElo), 
                        rank: sortedPrep.indexOf(kId) + 1, 
                        percentile: getPct(kStats.prepElo, scoresPrep) 
                    },
                    castle_elo: { 
                        score: Math.round(kStats.castleElo), 
                        rank: sortedCastle.indexOf(kId) + 1, 
                        percentile: getPct(kStats.castleElo, scoresCastle) 
                    },
                    overall_elo: { 
                        score: Math.round(kStats.overallElo), 
                        rank: sortedOverall.indexOf(kId) + 1, 
                        percentile: getPct(kStats.overallElo, scoresOverall) 
                    }
                };
            });
        }

        // 3. Index Matches and Pre-calculate Kingdom Timelines
        const kingdomTimelineMap = {};
        for (const file of matchFiles) {
            const sId = file.match(/\d+/)[0];
            const seasonMatches = JSON.parse(await fs.readFile(path.join(CONFIG.MATCH_DIR, file), 'utf8'));
            
            if (seasonMatches.length > 0 && data.seasons[sId]) {
                data.seasons[sId].date = seasonMatches[0].season_date;
            }

            seasonMatches.forEach(m => {
                const mId = m.kvk_id.toString();
                data.matches[mId] = {
                    season_id: parseInt(sId),
                    kingdom_a_id: m.kingdom_a,
                    kingdom_b_id: m.kingdom_b,
                    prep_winner_id: m.prep_winner,
                    castle_winner_id: m.castle_winner,
                    overall_winner_id: (m.prep_winner === m.castle_winner) ? m.prep_winner : null
                };

                [m.kingdom_a, m.kingdom_b].forEach(kId => {
                    const kKey = kId.toString();
                    if (!kingdomTimelineMap[kKey]) kingdomTimelineMap[kKey] = [];
                    kingdomTimelineMap[kKey].push({
                        type: "match",
                        date: m.season_date,
                        match_id: parseInt(mId)
                    });
                });
            });
        }

        // 4. Weave Transfers into History and Finalize Kingdom Objects
        for (const [kId, kCreatedDate] of Object.entries(kingdomsRaw)) {
            const kIdNum = parseInt(kId);
            const timeline = kingdomTimelineMap[kId] || [];

            // Process via the indexed transfers to find matches
            Object.entries(transfersIndexed).forEach(([tNum, t]) => {
                Object.entries(t.groups).forEach(([gNum, group]) => {
                    const min = parseInt(group.min_kingdom);
                    const max = parseInt(group.max_kingdom);
                    
                    if (kIdNum >= min && kIdNum <= max) {
                        timeline.push({
                            type: "transfer",
                            date: t.date,
                            transfer_id: parseInt(tNum),
                            group_id: parseInt(gNum)
                        });
                    }
                });
            });

            data.kingdoms[kId] = {
                created: kCreatedDate,
                history: timeline.sort((a, b) => new Date(a.date) - new Date(b.date))
            };
        }

        await fs.writeFile(CONFIG.OUTPUT_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ Assembly Complete! data.json generated with accurate Transfer Numbers.`);

    } catch (err) { console.error("❌ Assembly failed:", err); }
}

assemble();