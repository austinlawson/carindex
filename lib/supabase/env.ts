const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

export const listingMediaBucket =
  process.env.SUPABASE_LISTING_MEDIA_BUCKET || "listing-media";

export function getSupabasePublicConfig() {
  if (!publicSupabaseUrl || !publicSupabaseKey) {
    return null;
  }

  return {
    url: publicSupabaseUrl,
    publishableKey: publicSupabaseKey
  };
}

export function getSupabaseServiceConfig() {
  const publicConfig = getSupabasePublicConfig();

  if (!publicConfig || !serviceRoleKey) {
    return null;
  }

  return {
    ...publicConfig,
    serviceRoleKey
  };
}

export function isSupabaseConfigured() {
  return Boolean(getSupabasePublicConfig());
}

export function isSupabaseServiceConfigured() {
  return Boolean(getSupabaseServiceConfig());
}
