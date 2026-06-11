import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ApiCallLedgerEntry = {
  provider: string;
  monthKey: string;
  callsUsed: number;
  lastCallAt?: string;
  lastRunAt?: string;
  notes?: string;
};

const ledgerPath = resolve("src/data/apiCallLedger.json");
const provider = "marketcheck";
const monthKey = new Date().toISOString().slice(0, 7);
const monthlyCallLimit = readIntEnv("MARKETCHECK_MONTHLY_CALL_LIMIT", 500);
const monthlySafetyBuffer = readIntEnv("MARKETCHECK_MONTHLY_SAFETY_BUFFER", 50);
const monthlyAllowed = monthlyCallLimit - monthlySafetyBuffer;
const ledger = readLedger();
const entry = ledger.find((item) => item.provider === provider && item.monthKey === monthKey);
const callsUsed = entry?.callsUsed ?? 0;

console.log("MarketCheck API usage");
console.log(`Month: ${monthKey}`);
console.log(`Calls used: ${callsUsed}`);
console.log(`Safety-adjusted monthly allowance: ${monthlyAllowed}`);
console.log(`Estimated remaining calls: ${Math.max(0, monthlyAllowed - callsUsed)}`);
console.log(`Last call at: ${entry?.lastCallAt ?? "never"}`);
console.log(`Last run at: ${entry?.lastRunAt ?? "never"}`);
console.log(`Notes: ${entry?.notes ?? ""}`);

function readLedger() {
  if (!existsSync(ledgerPath)) {
    return [] as ApiCallLedgerEntry[];
  }

  try {
    return JSON.parse(readFileSync(ledgerPath, "utf8")) as ApiCallLedgerEntry[];
  } catch {
    return [] as ApiCallLedgerEntry[];
  }
}

function readIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}
