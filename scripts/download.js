const fs = require('fs/promises');
const path = require('path');

const BASE_URL = 'https://kingshot.net/api/kvk';
const TRACKER_URL = 'https://kingshot.net/api/kingdom-tracker';
const OUTPUT_DIR = path.join(__dirname, '../data/matches');
const CACHE_FILE = path.join(__dirname, '../data/kingdoms.json');
const LIMIT = 100;

let kingdomCache = {};

/**
 * Validates if a string is a real ISO date and NOT just "today"
 */
function isValidHistoricalDate(d) {
    const date = new Date(d);
    if (!(date instanceof Date) || isNaN(date)) return false;
    
    // Safety check: If the date is exactly today (within 1 min), it's likely the "fallback" error
    const now = new Date();
    if (Math.abs(now - date) < 60000) return false;
    
    return true;
}

async function fetchApi(url, isFullUrl = false) {
    const targetUrl = isFullUrl ? url : `${BASE_URL}${url}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
        'Accept': 'application/json',
    };
    const response = await fetch(targetUrl, { headers });
    const result = await response.json();

    if (!response.ok || result.status === 'error') {
        throw new Error(result.message || 'Unknown error');
    }
    return result;
}

async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        kingdomCache = JSON.parse(data);
        console.log(`Loaded ${Object.keys(kingdomCache).length} kingdoms from cache.`);
    } catch (e) {
        console.log("Starting fresh cache.");
        kingdomCache = {};
    }
}

async function saveCache() {
    await fs.writeFile(CACHE_FILE, JSON.stringify(kingdomCache, null, 2));
}

async function getKingdomOpenTime(kingdomId) {
    if (kingdomCache[kingdomId]) return kingdomCache[kingdomId];

    try {
        // FIXED: Using 'kingdomId' instead of 'kingdomID'
        const response = await fetchApi(`${TRACKER_URL}?kingdomId=${kingdomId}`, true);
        const openTime = response.data?.servers?.[0]?.openTime;
        
        if (openTime && isValidHistoricalDate(openTime)) {
            kingdomCache[kingdomId] = openTime;
            return openTime;
        }
    } catch (err) {
        console.warn(`  ! Could not fetch K${kingdomId}: ${err.message}`);
    }
    return null;
}

function calculateAge(matchDateStr, openTimeStr) {
    if (!openTimeStr || !matchDateStr) return null;
    
    const matchDate = new Date(matchDateStr);
    const openDate = new Date(openTimeStr);
    
    const diffTime = matchDate.getTime() - openDate.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return days < 0 ? 0 : days;
}

async function getAllMatchesForSeason(seasonId) {
    let allMatches = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const response = await fetchApi(`/matches?season=${seasonId}&page=${page}&limit=${LIMIT}`);
        const matches = response.data || [];

        for (const m of matches) {
            const openA = await getKingdomOpenTime(m.kingdom_a);
            const openB = await getKingdomOpenTime(m.kingdom_b);
            
            m.kingdom_a_age_days = calculateAge(m.season_date, openA);
            m.kingdom_b_age_days = calculateAge(m.season_date, openB);
        }

        allMatches = allMatches.concat(matches);
        hasMore = response.pagination.hasMore;
        if (hasMore) page++;
        
        // Save cache incrementally to disk
        await saveCache();
    }
    return allMatches;
}

function jsonToCsv(dataArray) {
    if (!dataArray || dataArray.length === 0) return '';
    const headers = Object.keys(dataArray[0]);
    const rows = dataArray.map(row => {
        return headers.map(header => {
            let val = row[header] ?? '';
            const strVal = String(val);
            return (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) 
                ? `"${strVal.replace(/"/g, '""')}"` : strVal;
        }).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

async function main() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await loadCache();

        const seasonsResponse = await fetchApi('/seasons');
        const seasons = seasonsResponse.data;

        for (const season of seasons) {
            const seasonId = season.season_id;
            console.log(`Processing Season ${seasonId}...`);
            const matches = await getAllMatchesForSeason(seasonId);
            
            if (matches.length > 0) {
                const baseFileName = path.join(OUTPUT_DIR, `season_${seasonId}`);
                await fs.writeFile(`${baseFileName}.json`, JSON.stringify(matches, null, 2));
                await fs.writeFile(`${baseFileName}.csv`, jsonToCsv(matches));
                console.log(`  ✓ Saved ${matches.length} matches.`);
            }
        }
        console.log("Download complete.");
    } catch (error) {
        console.error('Fatal Error:', error.message);
    }
}

main();