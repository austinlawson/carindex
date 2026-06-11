# CarIndex

CarIndex is a short-form car classifieds prototype built with Next.js, Supabase, and authorized listing data sources.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in local keys for Supabase, OpenAI, and listing-provider integrations.

## Useful Commands

```bash
npm run build
npm run fetch:marketcheck:dry
npm run supabase:import-snapshot:dry
```

See `SUPABASE_BACKEND_README.md` and `REAL_LISTINGS_README.md` for backend setup and provider sync details.
