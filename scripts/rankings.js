const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../results/seasons');
const OUTPUT_JSON = path.join(__dirname, '../results/rankings.json');

// PREP: Stable, Age-weighted
const PREP_K = 32;
const PREP_START_MAX = 1500;
const PREP_START_MIN = 1000;

// CASTLE: Volatile, Flat-start (Skill/Whale based)
const CASTLE_K = 80; // High volatility to catch "Whale" moves
const CASTLE_START_FLAT = 1200; 

// The "Sniper" Correction: Winning Prep boosts Castle confidence by 15% of a match
const PREP_TO_CASTLE_BOOST = 0.15; 

let currentRankings = {}; 

function updateElo(current, opponent, score, matches, k) {
	const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
	return current + k * (score - expected);
}

async function run() {
	const files = (await fs.readdir(DATA_DIR))
		.filter(f => f.endsWith('.json'))
		.sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

	let ledger = [];

	for (const file of files) {
		const matches = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
		const sId = parseInt(file.match(/\d+/)[0]);

		for (const m of matches) {
			const ids = [m.kingdom_a, m.kingdom_b];
			ids.forEach(id => {
				if (!currentRankings[id]) {
					// Age ID only anchors the Prep ranking
					const ratio = Math.max(0, Math.min(1, (1531 - id) / 1531));
					currentRankings[id] = {
						prep: PREP_START_MIN + (ratio * (PREP_START_MAX - PREP_START_MIN)),
						castle: CASTLE_START_FLAT, // Everyone starts equal in skill
						m: 0
					};
				}
			});

			const idA = m.kingdom_a;
			const idB = m.kingdom_b;
			const pWinA = m.prep_winner === idA ? 1 : (m.prep_winner === idB ? 0 : 0.5);
			const cWinA = m.castle_winner === idA ? 1 : (m.castle_winner === idB ? 0 : 0.5);

			const oldA = { ...currentRankings[idA] };
			const oldB = { ...currentRankings[idB] };

			// Update Prep Elo (Standard)
			currentRankings[idA].prep = updateElo(oldA.prep, oldB.prep, pWinA, oldA.m, PREP_K);
			currentRankings[idB].prep = updateElo(oldB.prep, oldA.prep, 1 - pWinA, oldB.m, PREP_K);

			// Update Castle Elo (Volatile + Prep Momentum)
			// If you win Prep, we treat the 'score' for Castle Elo update as slightly higher
			const momentumA = pWinA === 1 ? PREP_TO_CASTLE_BOOST : (pWinA === 0 ? -PREP_TO_CASTLE_BOOST : 0);
			
			currentRankings[idA].castle = updateElo(oldA.castle, oldB.castle, cWinA + momentumA, oldA.m, CASTLE_K);
			currentRankings[idB].castle = updateElo(oldB.castle, oldA.castle, (1 - cWinA) - momentumA, oldB.m, CASTLE_K);

			currentRankings[idA].m++;
			currentRankings[idB].m++;
		}

		for (const id in currentRankings) {
			ledger.push({
				season: sId,
				id: parseInt(id),
				prep_elo: Math.round(currentRankings[id].prep),
				castle_elo: Math.round(currentRankings[id].castle)
			});
		}
	}

	await fs.writeFile(OUTPUT_JSON, JSON.stringify(ledger, null, 2));
	console.log("Hybrid Rankings Generated.");
}
run();