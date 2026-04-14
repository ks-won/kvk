const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(__dirname, '../output/analysis.json');

async function compile() {
	try {
		const files = (await fs.readdir(DATA_DIR))
			.filter(f => f.endsWith('.json'))
			.sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

		const kingdomStats = {}; // Tracks running history for each kingdom
		const matchDataPoints = []; // Every match with pre-match context

		for (const file of files) {
			const matches = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
			const seasonId = parseInt(file.match(/\d+/)[0]);

			for (const m of matches) {
				const idA = m.kingdom_a;
				const idB = m.kingdom_b;

				// Initialize tracking if first time seeing them
				[idA, idB].forEach(id => {
					if (!kingdomStats[id]) {
						kingdomStats[id] = {
							id: id,
							prepWins: 0,
							castleWins: 0,
							totalMatches: 0,
							castleWinStreak: 0,
							lastPrepResult: null
						};
					}
				});

				// Record the "Snapshot" BEFORE the match results are applied
				// This is what we use to train a predictive model
				matchDataPoints.push({
					season: seasonId,
					kingdom_a: {
						id: idA,
						total_wr_prep: kingdomStats[idA].totalMatches > 0 ? (kingdomStats[idA].prepWins / kingdomStats[idA].totalMatches).toFixed(3) : 0,
						total_wr_castle: kingdomStats[idA].totalMatches > 0 ? (kingdomStats[idA].castleWins / kingdomStats[idA].totalMatches).toFixed(3) : 0,
						castle_streak: kingdomStats[idA].castleWinStreak
					},
					kingdom_b: {
						id: idB,
						total_wr_prep: kingdomStats[idB].totalMatches > 0 ? (kingdomStats[idB].prepWins / kingdomStats[idB].totalMatches).toFixed(3) : 0,
						total_wr_castle: kingdomStats[idB].totalMatches > 0 ? (kingdomStats[idB].castleWins / kingdomStats[idB].totalMatches).toFixed(3) : 0,
						castle_streak: kingdomStats[idB].castleWinStreak
					},
					age_diff: idB - idA, // Positive means A is older
					// THE TARGETS (What actually happened)
					actual_prep_winner: m.prep_winner === idA ? 'A' : (m.prep_winner === idB ? 'B' : 'Draw'),
					actual_castle_winner: m.castle_winner === idA ? 'A' : (m.castle_winner === idB ? 'B' : 'Draw'),
					castle_captured: m.castle_captured
				});

				// Update running stats for the next match
				const pWinner = m.prep_winner;
				const cWinner = m.castle_winner;

				if (pWinner !== 0) {
					kingdomStats[pWinner].prepWins++;
				}
				if (cWinner !== 0) {
					kingdomStats[cWinner].castleWins++;
					kingdomStats[cWinner].castleWinStreak++;
					// Reset streak for the loser
					const loser = (cWinner === idA) ? idB : idA;
					kingdomStats[loser].castleWinStreak = 0;
				}
				
				kingdomStats[idA].totalMatches++;
				kingdomStats[idB].totalMatches++;
			}
		}

		await fs.writeFile(OUTPUT_FILE, JSON.stringify(matchDataPoints, null, 2));
		console.log(`Successfully compiled ${matchDataPoints.length} match data points for analysis.`);
		
		// Output a quick correlation insight to console
		const snipers = matchDataPoints.filter(m => 
			(m.actual_prep_winner === 'A' && m.actual_castle_winner === 'B') || 
			(m.actual_prep_winner === 'B' && m.actual_castle_winner === 'A')
		).length;

		console.log(`\nInitial Insight:`);
		console.log(`Total Matches: ${matchDataPoints.length}`);
		console.log(`"Sniper" Matches (Winner lost Prep but won Castle): ${snipers} (${((snipers/matchDataPoints.length)*100).toFixed(1)}%)`);

	} catch (err) {
		console.error("Compilation failed:", err.message);
	}
}

compile();