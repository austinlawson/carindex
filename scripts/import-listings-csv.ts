import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizeListings } from "../src/lib/normalizeListing";
import type { RawListingInput } from "../src/lib/listingTypes";

const csvPath = resolve("seed/listings.csv");
const examplePath = resolve("seed/listings.csv.example");
const outputPath = resolve("src/data/realListings.json");

const inputPath = readCsvInputPath();
const rows = parseCsv(readFileSync(inputPath, "utf8"));
const normalized = normalizeListings(rows as RawListingInput[], "csv");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

console.log(`Imported ${normalized.length} listing(s) from ${inputPath}`);
console.log(`Wrote ${outputPath}`);

function readCsvInputPath() {
  try {
    readFileSync(csvPath, "utf8");
    return csvPath;
  } catch {
    console.warn("seed/listings.csv not found. Falling back to seed/listings.csv.example.");
    return examplePath;
  }
}

function parseCsv(csv: string) {
  const rows = parseRows(csv).filter((row) => row.some((cell) => cell.trim().length > 0));
  const [headers, ...records] = rows;
  if (!headers || headers.length === 0) {
    throw new Error("CSV is missing a header row.");
  }

  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), record[index]?.trim() ?? ""]))
  );
}

function parseRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
