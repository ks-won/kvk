const fs = require('fs/promises');
const path = require('path');

const BASE_URL = 'https://kingshot.net/api/kvk';
const OUTPUT_DIR = path.join(__dirname, '../data');
const LIMIT = 100; // Max items per page as requested

/**
 * Helper to fetch and handle API errors based on the provided schemas
 */
async function fetchApi(endpoint) {
	const url = `${BASE_URL}${endpoint}`;
    console.log(`Fetching: ${url}`);
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
        'Accept': 'application/json',
    };
	const response = await fetch(url, { headers });
    console.log(`Received response: ${response.status} ${response.statusText}`);

    console.log(response.body);
	const result = await response.json();

	if (!response.ok || result.status === 'error') {
		const errorMsg = result.message || 'Unknown error';
		const errorKey = result.meta?.errorKey ? `[${result.meta.errorKey}]` : '';
		throw new Error(`API Error fetching ${url}: ${errorMsg} ${errorKey}`);
	}

	return result;
}

/**
 * Converts an array of JSON objects into a CSV string
 */
function jsonToCsv(dataArray) {
	if (!dataArray || dataArray.length === 0) return '';

	const headers = Object.keys(dataArray[0]);
	
	const rows = dataArray.map(row => {
		return headers.map(header => {
			let val = row[header];
			if (val === null || val === undefined) val = '';
			
			const strVal = String(val);
			// Escape quotes and wrap in quotes if the string contains a comma, newline, or quote
			if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
				return `"${strVal.replace(/"/g, '""')}"`;
			}
			return strVal;
		}).join(',');
	});

	return [headers.join(','), ...rows].join('\n');
}

/**
 * Fetches all matches for a given season, handling pagination
 */
async function getAllMatchesForSeason(seasonId) {
	let allMatches = [];
	let page = 1;
	let hasMore = true;

	console.log(`  -> Fetching matches for Season ${seasonId}...`);

	while (hasMore) {
		const endpoint = `/matches?season=${seasonId}&page=${page}&limit=${LIMIT}`;
		const response = await fetchApi(endpoint);
		
		const matches = response.data || [];
		allMatches = allMatches.concat(matches);
		
		const pagination = response.pagination;
		
		console.log(`	 - Page ${page}/${pagination.totalPages || '?'} retrieved (${matches.length} records)`);
		
		hasMore = pagination.hasMore;
		if (hasMore) page++;
	}

	return allMatches;
}

/**
 * Main execution function
 */
async function main() {
	try {
		// 1. Create output directory if it doesn't exist
		await fs.mkdir(OUTPUT_DIR, { recursive: true });
		console.log(`Created output directory: ${OUTPUT_DIR}\n`);

		// 2. Fetch all seasons
		console.log('Fetching seasons list...');
		const seasonsResponse = await fetchApi('/seasons');
		const seasons = seasonsResponse.data;
		console.log(`Found ${seasons.length} seasons.\n`);

		// 3. Loop through each season, fetch matches, and save files
		for (const season of seasons) {
			const seasonId = season.season_id;
			
			try {
				const matches = await getAllMatchesForSeason(seasonId);
				
				if (matches.length > 0) {
					const baseFileName = path.join(OUTPUT_DIR, `season_${seasonId}`);
					
					// Save JSON
					await fs.writeFile(`${baseFileName}.json`, JSON.stringify(matches, null, 2));
					
					// Save CSV
					const csvData = jsonToCsv(matches);
					await fs.writeFile(`${baseFileName}.csv`, csvData);
					
					console.log(`  ✓ Saved ${matches.length} matches to ${baseFileName}.json and .csv\n`);
				} else {
					console.log(`  ! No matches found for Season ${seasonId}\n`);
				}

			} catch (err) {
				console.error(`  X Failed to process Season ${seasonId}:`, err.message);
			}
		}

		console.log('All downloads completed successfully!');

	} catch (error) {
		console.error('Script failed:', error.message);
	}
}

main();