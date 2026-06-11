import { NextResponse } from "next/server";
import { getBackendFeedPage } from "@/lib/supabase/feed-listings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit") ?? 24);
  const limit = Number.isFinite(limitParam) ? limitParam : 24;
  const page = await getBackendFeedPage({ limit, cursor });

  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}
