import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getFeedInterestEventWeight, type FeedInterestEventType } from "@/lib/feed-interest";

export const dynamic = "force-dynamic";

type InterestEventInsert = Database["public"]["Tables"]["listing_interest_events"]["Insert"];
type RawInterestEvent = Record<string, unknown>;

const allowedEventTypes = new Set<FeedInterestEventType>([
  "view",
  "dwell",
  "long_view",
  "revisit",
  "scroll_back",
  "save",
  "share",
  "ai_open",
  "gallery_open",
  "description_open",
  "offer_open",
  "contact_open"
]);

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 }
    );
  }

  const payload = await request.json().catch(() => null);
  const anonymousId = readAnonymousId(payload);
  const rawEvents: unknown[] = Array.isArray(payload?.events) ? payload.events : [];
  const events = rawEvents.slice(0, 40).flatMap((event: unknown): InterestEventInsert[] => {
    const normalized = normalizeInterestEvent(event, anonymousId);
    return normalized ? [normalized] : [];
  });

  if (events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const accessToken = getBearerToken(request);
  if (accessToken) {
    const {
      data: { user }
    } = await supabase.auth.getUser(accessToken);

    if (user) {
      events.forEach((event: InterestEventInsert) => {
        event.user_id = user.id;
      });
    }
  }

  const { error } = await supabase.from("listing_interest_events").insert(events);

  if (error) {
    return NextResponse.json(
      { error: `Could not log listing interest: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inserted: events.length });
}

function normalizeInterestEvent(event: unknown, anonymousId: string | null): InterestEventInsert | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;

  const object = event as RawInterestEvent;
  const listingId = typeof object.listingId === "string" ? object.listingId : "";
  const eventType = typeof object.type === "string" ? object.type : "";
  if (!listingId || !allowedEventTypes.has(eventType as FeedInterestEventType)) return null;

  const dwellMs = readNumber(object.dwellMs);
  const occurredAt = readIsoDate(object.occurredAt) ?? new Date().toISOString();
  const metadata = isJsonObject(object.metadata) ? object.metadata : {};
  const snapshot = isJsonObject(object.listingSnapshot) ? object.listingSnapshot : {};
  const eventWeight = getFeedInterestEventWeight(eventType as FeedInterestEventType, dwellMs ?? 0);

  return {
    anonymous_id: anonymousId,
    listing_id: listingId,
    event_type: eventType,
    event_weight: eventWeight,
    dwell_ms: dwellMs ?? null,
    metadata: metadata as Json,
    listing_snapshot: snapshot as Json,
    occurred_at: occurredAt
  };
}

function readAnonymousId(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const value = (payload as { anonymousId?: unknown }).anonymousId;
  return typeof value === "string" && value.length <= 120 ? value : null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  return authorization.slice("bearer ".length).trim();
}

function readNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : undefined;
}

function readIsoDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function isJsonObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
