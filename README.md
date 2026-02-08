# Blocket Search CSV Capture (Tampermonkey)

Tampermonkey userscript for `blocket.se` search result pages that captures listing data into a CSV you can download and paste into an AI for comparison.

## What it does

On Blocket search pages (`/recommerce/forsale/search?...`), the script injects a small floating control bar in the bottom-right:

**Capture | Ads: <count> | Clear | Download**

- **Capture**: scans the current results page and stores each listing (deduplicated).
- **Ads: <count>**: shows how many unique ads are currently stored for this search query.
- **Clear**: wipes the stored dataset for the current search query.
- **Download**: downloads a CSV named after the search query (single file per query).

Captured rows are stored in `localStorage` per search query so you can capture from multiple pages/refreshes and download once.

## CSV format

Columns (in order):

- `id` — Blocket item id extracted from the listing link (example: `20689928`)
- `title`
- `price_sek` — integer SEK price when available
- `place` — e.g. `Stockholm`
- `lifetime` — e.g. `9 tim`
- `link` — full URL to the item page

Example row:

```csv
"id","title",price_sek,"place","lifetime","link"
"20689928","Samsung Projektor The Free Style 2nd Generation Helt Ny",4900,"Stockholm","9 tim","https://www.blocket.se/recommerce/forsale/item/20689928"

