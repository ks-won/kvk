# Data Specification: data.json

## 1. Overview
The `data.json` file is a pre-compiled, view-ready data store for the Kingdom Rankings static site. It uses a **Partially Normalized Index** strategy: large entities (Kingdoms, Matches, Transfers) are stored in flat registries, while chronological context is "woven" into individual kingdom timelines during the build process to eliminate runtime computation.

---

## 2. Schema Definition

### 2.1 Root Structure
```json
{
  "metadata": { 
    "current_season": 12 
  },
  "seasons": { 
    "{season_id}": "SeasonObject" 
  },
  "kingdoms": { 
    "{kingdom_id}": "KingdomObject" 
  },
  "matches": { 
    "{match_id}": "MatchObject" 
  },
  "transfers": { 
    "{transfer_id}": "TransferObject" 
  }
}
```

### 2.2 The Season Object (seasons)
Stores the rankings snapshot at the end of a specific season.
```json
"12": {
  "date": "2026-01-31",
  "rankings": {
    "101": {
      "confidence": 0.95,
      "prep_elo":    { "score": 1200, "rank": 45, "percentile": 82 },
      "castle_elo":  { "score": 1350, "rank": 12, "percentile": 95 },
      "overall_elo": { "score": 1275, "rank": 28, "percentile": 89 }
    }
  }
}
```

### 2.3 The Kingdom Object (kingdoms)
Contains static data and a pre-sorted chronological history.
```json
"101": {
  "created": "2026-01-01T00:00:00.000Z",
  "history": [
    { 
      "type": "match", 
      "date": "2026-01-31", 
      "match_id": 2522 
    },
    { 
      "type": "transfer", 
      "date": "2026-02-15", 
      "transfer_id": 2, 
      "group_id": 3 
    }
  ]
}
```

### 2.4 The Match Object (matches)
Details of a specific KvK engagement.
```json
"2522": {
  "season_id": 10,
  "kingdom_a_id": 1,
  "kingdom_b_id": 6,
  "prep_winner_id": 1,
  "castle_winner_id": 6,
  "overall_winner_id": null // Null if split, Kingdom ID if a sweep
}
```

### 2.5 The Transfer Object (transfers)
Migration data including kingdom range groups.
```json
"2": {
  "date": "2026-02-15",
  "groups": {
    "3": {
      "progress": "Gen 6 Heroes & Pets",
      "min_kingdom": 1,
      "max_kingdom": 25,
      "leading_kingdoms": [1, 5, 12]
    }
  }
}
```

---

## 3. Implementation Logic

### 3.1 Kingdom Detail Page
To render a kingdom's history, iterate through `kingdoms[id].history`.
- **Matches:** Fetch full details from `matches[match_id]`. To show the Elo "at the time," lookup `seasons[match.season_id].rankings[id]`.
- **Transfers:** Fetch details from `transfers[transfer_id].groups[group_id]`.

### 3.2 Classification (Runtime)
Classifications are calculated dynamically by the frontend to save space:
- **Warrior:** `castle_elo.score - prep_elo.score > 100`
- **Farmer:** `prep_elo.score - castle_elo.score > 100`
- **Balanced:** Difference is `<= 100`

### 3.3 Percentiles & Ranks
- **rank:** The numerical position (1-indexed) within that specific Elo category for that season.
- **percentile:** 0-99. A value of 99 means the kingdom scored higher than 99% of other kingdoms in that specific Elo category.

### 3.4 Match Predictor
Use the `overall_elo.score` from the **latest season** in `seasons` for both participants.
Equation: E_A = 1 / (1 + 10^((R_B - R_A)/400))

---

## 4. Maintenance Notes
- **Sorting:** The `history` array in the `kingdoms` object is guaranteed to be pre-sorted by `date` (ASC) during the build.
- **IDs:** Always use `toString()` when using IDs as keys, as JSON keys are always strings.