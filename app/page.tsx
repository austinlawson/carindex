import { AppShell } from "@/components/app-shell";
import { appListings } from "@/data/listing-source";
import { getBackendFeedPage } from "@/lib/supabase/feed-listings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const backendPage = await getBackendFeedPage({ limit: 36 });
  const hasBackendFeed = backendPage.listings.length > 0;
  const listings = hasBackendFeed ? backendPage.listings : appListings;

  return (
    <AppShell
      listings={listings}
      initialFeedCursor={hasBackendFeed ? backendPage.nextCursor : null}
      backendFeedAvailable={hasBackendFeed}
    />
  );
}
