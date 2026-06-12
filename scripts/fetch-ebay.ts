import { loadScriptEnv } from "./load-script-env";

loadScriptEnv("eBay Motors sync", []);

const dryRun = process.argv.includes("--dry");

async function main() {
  const { syncEbayInventory } = await import("../lib/ebay/sync");
  const result = await syncEbayInventory({ dryRun });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
