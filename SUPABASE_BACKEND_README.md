# Supabase Backend Setup

This app now has the first backend foundation for real listings, media, profiles, saved cars, offers, and messages.

Stateful product features now use Supabase instead of browser `localStorage`. The homepage feed reads active Supabase listings first, then falls back to imported JSON/mock listings only when the database feed is empty or unavailable.

## Environment

Add these to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qgmnivdlwwfrxfadrtyr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_LISTING_MEDIA_BUCKET=listing-media
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe Supabase client values.
- `SUPABASE_SECRET_KEY` is server-only. Do not expose it in the browser.
- `SUPABASE_DB_PASSWORD` is server-only and only needed for CLI/direct database tooling later.
- Older Supabase projects may call these `anon` and `service_role` keys. This app supports both:
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

## Database

Run the SQL migration in:

```text
supabase/migrations/001_initial_backend.sql
```

Use either:

1. Supabase Dashboard -> SQL Editor -> paste the migration -> Run
2. Supabase CLI later, after linking the local project

The migration creates:

- `profiles`
- `listings`
- `listing_media`
- `saved_listings`
- `offers`
- `offer_events`
- `messages`
- `listing_imports`
- `listing-media` storage bucket

For video-first uploads, also run:

```text
supabase/migrations/002_video_upload_limits.sql
```

This targets a 500 MB bucket-level limit for `listing-media`. Supabase also has a project-wide Storage global file size limit that takes precedence. Set that in Supabase Dashboard -> Storage -> Settings -> Global file size limit before raising the bucket above the current global cap.

## Import Current Snapshot

After the migration is applied and `.env.local` has the Supabase URL plus server secret, import the current local listing snapshot into Supabase:

```powershell
npm run supabase:import-snapshot:dry
npm run supabase:import-snapshot
```

The importer reads `src/data/realListings.json`, creates stable UUID database rows, preserves the original provider ID in `provider_listing_id`, writes `listing_media`, and records `listing_imports`.

## Product Rules Captured

- User-upload private-seller listings can receive offers.
- Dealer and imported/API listings do not receive offers by default.
- Offer rows are visible only to the buyer and seller.
- Listing media uploads are scoped to the authenticated user's storage folder.
- Imported listings are intended for server/admin writes only.

## Cost Guardrails

The first backend pass intentionally avoids higher-cost patterns:

- No realtime subscriptions by default
- No video transcoding
- No AI processing inside Supabase
- No deposit/payment workflow
- No public write access
- Video and larger photo uploads use Supabase resumable uploads from the browser
- Videos over roughly 12 MB are optimized in the browser before upload when `MediaRecorder` and canvas capture are available
- The initial media bucket has a 100 MB per-file limit; `002_video_upload_limits.sql` raises the bucket target to 500 MB after the project global limit is raised

Video storage and egress are the main cost risks. Keep uploaded seller video short during testing.

## Video Compression

The Add Listing flow now attempts client-side video optimization before upload:

- Source: selected phone video file
- Processing: browser canvas + `MediaRecorder`
- Target: feed-friendly dimensions up to 720 px short side / 1280 px long side
- Timing: optimization starts silently as soon as a video is selected, so Publish can reuse the prepared file
- Upload: optimized file goes through Supabase resumable upload
- Fallback: original file uploads if compression is unsupported, fails, or does not reduce size enough

This is enough for prototype testing. For production, consider a server-side media pipeline for consistent H.264/AAC output, thumbnails, adaptive bitrate renditions, content moderation, and better progress/retry controls.

## Local Checks

Confirm env detection without exposing keys:

```powershell
curl http://localhost:3000/api/backend/status
```

Expected shape:

```json
{
  "supabaseConfigured": true,
  "supabaseServiceConfigured": true,
  "listingMediaBucket": "listing-media"
}
```

`supabaseServiceConfigured` is `true` only when a server-only secret key is present.

## Implemented In The App

- Supabase browser/server/admin clients
- CarIndex.ai sign-in and sign-up screens
- Account-backed profile sync through `profiles`
- Account-backed saved cars through `saved_listings`
- Account-backed user listings through `listings`
- Account-backed listing media upload through Supabase Storage
- Account-backed offer creation and offer status updates through `offers` and `offer_events`
- Server-rendered homepage feed from active Supabase `listings` and `listing_media`
- Public feed fallback from imported JSON/mock data only while database rows are empty
- No app-level `localStorage` fallback for saved cars, offers, profiles, or uploaded listings

## What Still Uses Local Files

The browser app can still read `src/data/realListings.json` and mock listings as a public feed fallback. That keeps the feed usable if the database has no imported listings yet.

User-created listings, uploaded media, saves, profiles, and offers should be written to Supabase after the migration is applied.

## Next Implementation Steps

1. Create a test account in the app.
2. Confirm a `profiles` row is created after sign-in.
3. Upload a private-seller photo listing and confirm `listings`, `listing_media`, and Storage rows are created.
4. Save a listing and confirm `saved_listings` updates.
5. Test buyer/seller offers using two accounts.
6. Update the MarketCheck/eBay import scripts to upsert provider listings into `listings`, `listing_media`, and `listing_imports`.
7. Add buyer/seller messaging through `messages`.
