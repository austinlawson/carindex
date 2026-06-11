import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadScriptEnv } from "./load-script-env";
import { normalizeListings } from "../src/lib/normalizeListing";
import type { RawListingInput } from "../src/lib/listingTypes";

loadScriptEnv("eBay Motors snapshot", ["EBAY_MOTORS_API_KEY"]);

const apiKey = process.env.EBAY_MOTORS_API_KEY;
const outputPath = resolve("src/data/realListings.json");

if (!apiKey) {
  console.log("EBAY_MOTORS_API_KEY is not set. Skipping eBay Motors snapshot fetch.");
  process.exit(0);
}

// Placeholder for an authorized eBay Motors integration.
// Map API-specific fields into RawListingInput objects here, then normalize.
// Do not scrape websites. Only use data permitted by your API agreement.
const authorizedApiRows: RawListingInput[] = [];

const normalized = normalizeListings(authorizedApiRows, "ebay");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

console.log(`Wrote ${normalized.length} eBay Motors listing(s) to ${outputPath}`);
