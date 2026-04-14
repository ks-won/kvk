const fs = require('fs/promises');
const path = require('path');

async function buildSiteData() {
	const historyPath = path.join(__dirname, '../output/rankings.json');
	const analysisPath = path.join(__dirname, '../output/analysis.json');
	const outputPath = path.join(__dirname, '../web/data.json');

	const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
	const results = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
	
	const latestSeason = Math.max(...history.map(e => e.season));
	const kingdoms = {};

	// Get latest stats
	history.forEach(entry => {
		if (!kingdoms[entry.id]) kingdoms[entry.id] = { id: entry.id, history: [] };
		kingdoms[entry.id].history.push(entry);
		if (entry.season === latestSeason) {
			kingdoms[entry.id].latest = entry;
		}
	});

	// Attach match results to each kingdom
	results.forEach(m => {
		[m.kingdom_a.id, m.kingdom_b.id].forEach(id => {
			if (kingdoms[id]) {
				if (!kingdoms[id].matches) kingdoms[id].matches = [];
				kingdoms[id].matches.push(m);
			}
		});
	});

	const kingdomsArray = Object.values(kingdoms);

	// Calculate percentiles once during build
	['prep_elo', 'castle_elo'].forEach(field => {
		const values = kingdomsArray.map(k => k.latest[field]).sort((a, b) => a - b);
		kingdomsArray.forEach(k => {
			// Sort history by season so the frontend can show a chronological trend
			k.history.sort((a, b) => a.season - b.season);

			const index = values.findIndex(v => v >= k.latest[field]);
			k.latest[`${field}_percentile`] = ((index / values.length) * 100).toFixed(0);
		});
	});

	await fs.writeFile(outputPath, JSON.stringify(Object.values(kingdoms)));
	console.log("Site data generated.");
}
buildSiteData();