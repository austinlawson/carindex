import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listingMediaBucket } from "@/lib/supabase/env";

type AccountListingRow = {
  id: string;
  ai_voice_url: string | null;
  raw_provider_summary: unknown;
};

type AccountMediaRow = {
  storage_path: string | null;
};

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 }
    );
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
  }

  const listingResult = await supabase
    .from("listings")
    .select("id, ai_voice_url, raw_provider_summary")
    .eq("owner_id", user.id);

  if (listingResult.error) {
    return NextResponse.json(
      { error: `Could not load account listings: ${listingResult.error.message}` },
      { status: 500 }
    );
  }

  const listings = (listingResult.data ?? []) as AccountListingRow[];
  const listingIds = listings.map((listing) => listing.id);
  const storagePaths = new Set<string>();

  if (listingIds.length > 0) {
    const mediaResult = await supabase
      .from("listing_media")
      .select("storage_path")
      .in("listing_id", listingIds);

    if (mediaResult.error) {
      return NextResponse.json(
        { error: `Could not load listing media: ${mediaResult.error.message}` },
        { status: 500 }
      );
    }

    for (const row of (mediaResult.data ?? []) as AccountMediaRow[]) {
      if (row.storage_path) {
        storagePaths.add(row.storage_path);
      }
    }
  }

  for (const listing of listings) {
    const voicePath = extractStoragePathFromPublicUrl(listing.ai_voice_url);
    if (voicePath) storagePaths.add(voicePath);

    const rawVoicePath = extractRawSummaryVoiceStoragePath(listing.raw_provider_summary);
    if (rawVoicePath) storagePaths.add(rawVoicePath);
  }

  try {
    await removeStoragePaths([...storagePaths], supabase);
  } catch (storageError) {
    return NextResponse.json(
      {
        error:
          storageError instanceof Error
            ? storageError.message
            : "Could not delete account storage objects."
      },
      { status: 500 }
    );
  }

  if (listingIds.length > 0) {
    const deleteListingsResult = await supabase
      .from("listings")
      .delete()
      .eq("owner_id", user.id);

    if (deleteListingsResult.error) {
      return NextResponse.json(
        { error: `Could not delete account listings: ${deleteListingsResult.error.message}` },
        { status: 500 }
      );
    }
  }

  const deleteUserResult = await supabase.auth.admin.deleteUser(user.id);

  if (deleteUserResult.error) {
    return NextResponse.json(
      { error: `Could not delete account: ${deleteUserResult.error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true, listingsDeleted: listingIds.length });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function removeStoragePaths(
  storagePaths: string[],
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
) {
  const uniquePaths = [...new Set(storagePaths.map((path) => path.trim()).filter(Boolean))];

  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    if (chunk.length === 0) continue;

    const { error } = await supabase.storage.from(listingMediaBucket).remove(chunk);

    if (error) {
      throw new Error(`Could not delete storage objects: ${error.message}`);
    }
  }
}

function extractRawSummaryVoiceStoragePath(rawSummary: unknown) {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) {
    return "";
  }

  const aiVoice = (rawSummary as { aiVoice?: unknown }).aiVoice;
  if (!aiVoice || typeof aiVoice !== "object" || Array.isArray(aiVoice)) {
    return "";
  }

  const audioUrl = (aiVoice as { audioUrl?: unknown }).audioUrl;
  return typeof audioUrl === "string" ? extractStoragePathFromPublicUrl(audioUrl) : "";
}

function extractStoragePathFromPublicUrl(url: string | null | undefined) {
  if (!url) return "";

  try {
    const parsedUrl = new URL(url);
    const marker = `/storage/v1/object/public/${listingMediaBucket}/`;
    const markerIndex = parsedUrl.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return "";
    }

    return decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length));
  } catch {
    return "";
  }
}
