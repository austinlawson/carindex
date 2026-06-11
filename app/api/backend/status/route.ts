import { NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  isSupabaseServiceConfigured,
  listingMediaBucket
} from "@/lib/supabase/env";

export function GET() {
  return NextResponse.json({
    supabaseConfigured: isSupabaseConfigured(),
    supabaseServiceConfigured: isSupabaseServiceConfigured(),
    listingMediaBucket
  });
}

