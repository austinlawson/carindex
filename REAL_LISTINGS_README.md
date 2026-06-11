# Real Listing Data

The app runs on mock data by default. Browser code never calls provider APIs and never exposes provider keys.

## Testing Goal

The default local snapshot testing goal is 50 cars. The production MarketCheck sync uses one broad 100-mile request with up to 500 rows, which matches the free-plan radius and pagination caps.

Default fetch settings:

- ZIP: `36360`
- Target count: `50`
- Primary radius: `100`
- Secondary radius: `100`
- Rows per request: `500`
- Car type: `used`
- Max calls per run: `1` for production sync
- Monthly call limit: `500`
- Monthly safety buffer: `50`

## CSV Import Mode

1. Copy `seed/listings.csv.example` to `seed/listings.csv`.
2. Fill in authorized listing data and image URLs.
3. Run:

```bash
npm run import:listings
```

The importer reads `seed/listings.csv` and writes normalized feed-ready listings to `src/data/realListings.json`. If `seed/listings.csv` is missing, it falls back to the example file so the import flow can be tested.

## MarketCheck Snapshot Mode

The snapshot scripts load `.env.local`, `.env`, and standard Next.js env files before reading `process.env`.

Option 1: create `.env.local` in the project root:

```env
MARKETCHECK_API_KEY=your_key_here
MARKETCHECK_ZIP=36360
MARKETCHECK_TARGET_COUNT=50
MARKETCHECK_PRIMARY_RADIUS=75
MARKETCHECK_SECONDARY_RADIUS=150
MARKETCHECK_MAX_CALLS_PER_RUN=3
MARKETCHECK_MONTHLY_CALL_LIMIT=500
MARKETCHECK_MONTHLY_SAFETY_BUFFER=50
```

Then run:

```bash
npm run fetch:marketcheck
```

Option 2: set variables manually in PowerShell before running the command:

```bash
$env:MARKETCHECK_API_KEY="your_key_here"
$env:MARKETCHECK_ZIP="36360"
npm run fetch:marketcheck
```

The script prints whether `MARKETCHECK_API_KEY` was detected, but it never prints the key.

Useful optional environment variables:

- `MARKETCHECK_ZIP`
- `MARKETCHECK_TARGET_COUNT`
- `MARKETCHECK_PRIMARY_RADIUS`
- `MARKETCHECK_SECONDARY_RADIUS`
- `MARKETCHECK_ROWS`
- `MARKETCHECK_MAX_PRICE`
- `MARKETCHECK_MIN_PRICE`
- `MARKETCHECK_MAKE`
- `MARKETCHECK_BODY_TYPE`
- `MARKETCHECK_CAR_TYPE`
- `MARKETCHECK_FORCE_REFRESH`
- `MARKETCHECK_MAX_CALLS_PER_RUN`
- `MARKETCHECK_MONTHLY_CALL_LIMIT`
- `MARKETCHECK_MONTHLY_SAFETY_BUFFER`

The fetcher writes:

- `src/data/realListings.json`: active app snapshot
- `src/data/listingCache.json`: longer-lived deduped cache
- `src/data/apiCallLedger.json`: local call usage guard

The app only reads local JSON snapshots. It never calls MarketCheck from the browser.

## MarketCheck Production Sync

The production sync endpoint is:

```text
GET /api/marketcheck/sync
POST /api/marketcheck/sync
```

It is built for the free MarketCheck plan:

- One MarketCheck call per sync.
- `rows=500`, `radius<=100`, `start=0`.
- Returned listings are upserted into Supabase.
- Returned provider IDs are marked with `last_seen_at`.
- MarketCheck listings not seen again are archived after `MARKETCHECK_STALE_GRACE_HOURS`.
- User-uploaded listings are never touched by this sync.
- Stale listings are archived, not hard-deleted, so a provider outage does not permanently wipe inventory.

Vercel cron runs the endpoint daily at `09:00 UTC` through `vercel.json`. Daily sync uses roughly 30 calls/month, leaving most of the 500-call free plan for manual refreshes or future experiments.

Required production environment variables:

```env
MARKETCHECK_API_KEY=your_key_here
MARKETCHECK_ZIP=36360
MARKETCHECK_PRIMARY_RADIUS=100
MARKETCHECK_ROWS=500
MARKETCHECK_STALE_GRACE_HOURS=72
MARKETCHECK_MONTHLY_CALL_LIMIT=500
MARKETCHECK_MONTHLY_SAFETY_BUFFER=50
CRON_SECRET=your_random_secret
```

`MARKETCHECK_SYNC_SECRET` can be used instead of `CRON_SECRET` for manual sync access. In production, the endpoint rejects requests unless one of those secrets is present and the request sends `Authorization: Bearer <secret>`.

Manual dry run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-domain.com/api/marketcheck/sync?dry=1"
```

Manual sync:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-domain.com/api/marketcheck/sync"
```

The sync writes operational history to `public.provider_sync_runs`. Apply `supabase/migrations/006_provider_sync_runs.sql` before relying on the monthly call guard in production.

## eBay Motors Production Sync

The eBay sync endpoint is:

```text
GET /api/ebay/sync
POST /api/ebay/sync
```

It uses the official eBay Browse API, not scraping. The sync searches eBay Motors category `6001` by default, normalizes usable vehicle listings into `source_mode='ebay'`, refreshes media rows, and archives stale eBay rows after `EBAY_STALE_GRACE_HOURS`. User-uploaded and MarketCheck listings are never touched by this sync.

Vercel cron runs this endpoint daily at `09:20 UTC` through `vercel.json`, twenty minutes after the MarketCheck sync.

Required production environment variables:

```env
EBAY_CLIENT_ID=your_ebay_app_id
EBAY_CLIENT_SECRET=your_ebay_cert_id
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_CATEGORY_ID=6001
EBAY_SORT=newlyListed
EBAY_ROWS=50
EBAY_BUYING_OPTIONS=FIXED_PRICE,AUCTION,BEST_OFFER
EBAY_LOCAL_PICKUP_ONLY=false
EBAY_PICKUP_ZIP=36360
EBAY_PICKUP_RADIUS=250
EBAY_MAX_MEDIA_PER_LISTING=12
EBAY_STALE_GRACE_HOURS=72
EBAY_ARCHIVE_MIN_SEEN_LISTINGS=5
EBAY_MONTHLY_CALL_LIMIT=5000
EBAY_MONTHLY_SAFETY_BUFFER=500
CRON_SECRET=your_random_secret
```

`EBAY_ACCESS_TOKEN` is available for quick local testing with a short-lived application token, but production should use `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` so the app can mint fresh application tokens automatically. `EBAY_SYNC_SECRET` can be used instead of `CRON_SECRET` for manual eBay sync access.

Optional filters:

- `EBAY_QUERY`: keyword filter. Leave empty for broad category search.
- `EBAY_LOCAL_PICKUP_ONLY=true`: narrows to local-pickup items near `EBAY_PICKUP_ZIP`.
- `EBAY_SORT=endingSoonest`: useful for auction-heavy tests.

Manual dry run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-domain.com/api/ebay/sync?dry=1"
```

Manual sync:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-domain.com/api/ebay/sync"
```

## Phone Preview With ngrok

To view the local prototype on your phone, add an ngrok authtoken to `.env.local`:

```env
NGROK_AUTHTOKEN=your_ngrok_token_here
```

Then run:

```bash
npm run dev:phone
```

The script loads `.env.local`, starts Next.js on `0.0.0.0:3000`, opens an ngrok tunnel, and prints a public HTTPS URL for your phone. The token is never printed.

Optional settings:

```env
NGROK_PORT=3000
NGROK_DOMAIN=your-reserved-domain.ngrok-free.app
```

`NGROK_DOMAIN` is only needed if you have a reserved domain in ngrok. Without it, ngrok provides a temporary URL.

## Dry Run

```bash
npm run fetch:marketcheck:dry
npm run fetch:ebay:dry
```

Dry run prints provider config and call budget status. It does not make API requests and does not increment `callsUsed`.

## Usage And Cache Commands

```bash
npm run cache:show-usage
npm run cache:clear-listings
npm run cache:clear-listings -- --all
```

`cache:show-usage` prints current-month MarketCheck usage and the safety-adjusted remaining calls.

`cache:clear-listings` clears only `src/data/realListings.json`, preserving `src/data/listingCache.json`.

`cache:clear-listings -- --all` clears both the active snapshot and listing cache.

## Call Ledger

The local ledger tracks:

- provider
- month key
- calls used
- last call time
- last run time
- notes

Before a provider request, the sync checks:

```text
callsUsed < MARKETCHECK_MONTHLY_CALL_LIMIT - MARKETCHECK_MONTHLY_SAFETY_BUFFER
callsUsed < EBAY_MONTHLY_CALL_LIMIT - EBAY_MONTHLY_SAFETY_BUFFER
```

The ledger increments only after an actual HTTP request is made, and it is saved after each request.

## Data Rules

Do not scrape Facebook Marketplace, Craigslist, dealer websites, or any website. Only use listings and photos from authorized APIs, permitted feeds, manual test data, or seller/dealer permission.
