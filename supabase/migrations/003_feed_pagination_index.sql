create index if not exists listings_active_feed_cursor_idx
on public.listings (status, created_at desc);
