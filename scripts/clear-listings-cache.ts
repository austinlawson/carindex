import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const clearAll = process.argv.includes("--all");
const snapshotPath = resolve("src/data/realListings.json");
const cachePath = resolve("src/data/listingCache.json");

writeFileSync(snapshotPath, "[]\n");
console.log(`Cleared active snapshot: ${snapshotPath}`);

if (clearAll) {
  writeFileSync(
    cachePath,
    `${JSON.stringify(
      {
        updatedAt: null,
        listings: {}
      },
      null,
      2
    )}\n`
  );
  console.log(`Cleared listing cache: ${cachePath}`);
} else {
  console.log("Preserved listing cache. Run `npm run cache:clear-listings -- --all` to clear cache too.");
}
