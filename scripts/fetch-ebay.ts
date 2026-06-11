import { loadScriptEnv } from "./load-script-env";
import { syncEbayInventory } from "../lib/ebay/sync";

loadScriptEnv("eBay Motors sync", []);

const dryRun = process.argv.includes("--dry");

syncEbayInventory({ dryRun })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
