import { NextResponse } from "next/server";
import { syncEbayInventory } from "@/lib/ebay/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleSyncRequest(request);
}

export async function POST(request: Request) {
  return handleSyncRequest(request);
}

async function handleSyncRequest(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized eBay sync request." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1" || url.searchParams.get("dryRun") === "1";
  const result = await syncEbayInventory({ dryRun });
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.EBAY_SYNC_SECRET ?? process.env.CRON_SECRET;
  const url = new URL(request.url);

  if (!secret) {
    const host = request.headers.get("host") ?? "";
    return (
      ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname) ||
      host.startsWith("localhost:") ||
      host.startsWith("127.0.0.1:") ||
      host.startsWith("0.0.0.0:")
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  return url.searchParams.get("secret") === secret;
}
