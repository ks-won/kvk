# Website Specification: Kingdom Rankings

## 1. Technology Stack
- **Framework:** Vue.js 3 (Global Build via CDN).
- **Styling:** Tailwind CSS (via CDN).
- **Routing:** URL Fragment (Hash) Routing. The app listens for `hashchange` events to swap views without page reloads.
- **Data:** Single `fetch()` call for `data.json` on app boot.

## 2. Global State & Routing Logic
- **State:** A reactive `appState` object containing the JSON and `route`.
- **Router Logic:** - `#/` -> Leaderboard (Main)
  - `#/kingdom/:id` -> Kingdom Detail
  - `#/match/:id` -> Historical Match Detail
  - `#/predict/:idA/:idB` -> Theoretical Matchup
- **Season Persistence:** The `activeSeasonId` should ideally be stored in `localStorage` or as a query param in the hash (e.g., `#/rankings?season=12`) to ensure shared links land on the correct data snapshot.

## 3. View: Leaderboard (Main)
- **Season Switcher:** A dropdown that updates the state. When changed, it updates the view without changing the hash (unless specific season deep-linking is desired).
- **Interactivity:** Rows link to `#/kingdom/:id`.
- **Data Display:** Each row in the leaderboard should show the prep/castle/overall elo as separate sortable columns. there should be a switcher to flip these between the full score, the percentile, and the rank (it should default to the full score).
- **Live Sorting:** The rankings should be sortable by clicking a column header, and provide an indication of the current sort column as well as the sort direction. the default sort is 'overall' descending.

## 4. View: Kingdom Detail (`#/kingdom/:id`)
- **Initialization:** On load, the app parses the ID from the URL hash.
- **Overview:** An overview of the current rankings and classification for the kingdom should be shown. This should show all 3 elo stats, with their raw rankings, +/- delta from the previous season (if applicable), their percentile and rank.
- **History Feed:** Iterates through `data.kingdoms
[id].history`.
  - **Matches:** Matches in the history feed should show the date and season of the match, the opponent faced, as well as the outcome in prep/castle/overall.
  - **Transfer Events:** Transfer events in the history feed should be interspersed with matches, but they should be distinct in appearance, showing the transfer event date, the group that the kingdom was in as well as an icon to indicate if the kingdom was a "leading" kingdom during that transfer event. Transfer events to not link to anything.
- **Deep Linking:** Match entries within the history link to `#/match/:id`.
- **


## 5. View: Match Detail (`#/match/:id`)
- **Initialization:** Parses `match_id` from the hash.
- **Contextual Elo:** Uses `data.matches[id].season_id` to pull the specific rankings for both kingdoms from that era.
- **Sharing:** Users can copy this URL to show exactly how a specific KvK played out.
- **Kingdom Display:** Matches should be shown as cards of the 2 kingdoms involved, with their ranking stats from the season _before_ the match occured. 
- **Results Display:** Below the kingdom cards should be results indicating the kingdom's win/draw/lose results for prep/castle/overall.

## 6. View: Theoretical Matchup (`#/predict/:idA/:idB`)
This view handles the shared "What If" scenarios.
- **State Hydration:** If the URL contains two IDs, the predictor automatically populates the input fields for Kingdom A and Kingdom B.
- **Logic:**
  1. Pull current Elo from `metadata.current_season`.
  2. Calculate and display win probabilities.
  3. Display a "Share this Matchup" button that copies the current `#/predict/idA/idB` URL to the clipboard.