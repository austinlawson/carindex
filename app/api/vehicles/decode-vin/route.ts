import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
const nhtsaDecodeBaseUrl =
  "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";

type NhtsaVinResponse = {
  Count?: number;
  Message?: string;
  SearchCriteria?: string;
  Results?: Array<Record<string, unknown>>;
};

type DecodeVinRequest = {
  vin?: unknown;
  modelYear?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DecodeVinRequest;
    const vin = normalizeVin(body.vin);
    const modelYear = normalizeModelYear(body.modelYear);

    if (!vin) {
      return NextResponse.json({ error: "Enter a VIN before decoding." }, { status: 400 });
    }

    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be exactly 17 characters." }, { status: 400 });
    }

    if (!vinPattern.test(vin)) {
      return NextResponse.json(
        { error: "VIN can only use letters A-H, J-N, P-R, S-Z, and numbers." },
        { status: 400 }
      );
    }

    const decodeUrl = new URL(`${nhtsaDecodeBaseUrl}/${encodeURIComponent(vin)}`);
    decodeUrl.searchParams.set("format", "json");
    if (modelYear) {
      decodeUrl.searchParams.set("modelyear", String(modelYear));
    }

    const response = await fetch(decodeUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 30 }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "NHTSA could not decode that VIN right now." },
        { status: 502 }
      );
    }

    const data = (await response.json()) as NhtsaVinResponse;
    const result = data.Results?.[0];

    if (!result) {
      return NextResponse.json(
        { error: "NHTSA did not return vehicle data for that VIN." },
        { status: 404 }
      );
    }

    const decoded = mapNhtsaVinResult(vin, result);

    if (!decoded.year || !decoded.make || !decoded.model) {
      return NextResponse.json(
        {
          error:
            decoded.errorText ||
            "NHTSA decoded the VIN, but did not return enough vehicle basics to fill the listing.",
          decoded
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        source: "nhtsa-vpic",
        decodedAt: new Date().toISOString(),
        decoded,
        nhtsa: {
          message: data.Message,
          searchCriteria: data.SearchCriteria
        }
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not decode VIN."
      },
      { status: 500 }
    );
  }
}

function mapNhtsaVinResult(vin: string, result: Record<string, unknown>) {
  const trimParts = uniqueCleanValues([readString(result.Trim), readString(result.Trim2)]);
  const transmission = uniqueCleanValues([
    formatTransmissionSpeed(readString(result.TransmissionSpeeds)),
    readString(result.TransmissionStyle)
  ]).join(" ");
  const plant = uniqueCleanValues([
    readString(result.PlantCity),
    readString(result.PlantState),
    readString(result.PlantCountry)
  ]).join(", ");

  return {
    vin,
    year: readNumber(result.ModelYear),
    make: formatVehicleName(readString(result.Make)),
    model: readString(result.Model),
    trim: trimParts.join(" "),
    series: readString(result.Series),
    bodyClass: readString(result.BodyClass),
    vehicleType: readString(result.VehicleType),
    doors: readNumber(result.Doors),
    driveType: readString(result.DriveType),
    engineCylinders: readNumber(result.EngineCylinders),
    displacementL: readString(result.DisplacementL),
    engineHp: readString(result.EngineHP),
    engineModel: readString(result.EngineModel),
    fuelTypePrimary: readString(result.FuelTypePrimary),
    transmission,
    manufacturer: readString(result.Manufacturer),
    plant,
    errorCode: readString(result.ErrorCode),
    errorText: readString(result.ErrorText),
    raw: result
  };
}

function normalizeVin(value: unknown) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : "";
}

function normalizeModelYear(value: unknown) {
  const parsed =
    typeof value === "string" || typeof value === "number"
      ? Number(String(value).trim())
      : 0;

  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function uniqueCleanValues(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    if (!value || seen.has(value.toLowerCase())) return false;
    seen.add(value.toLowerCase());
    return true;
  });
}

function formatTransmissionSpeed(value: string) {
  if (!value) return "";
  return /^\d+$/.test(value) ? `${value}-speed` : value;
}

function formatVehicleName(value: string) {
  if (!value) return "";

  const acronyms = new Set(["BMW", "GMC", "MINI", "RAM", "SRT"]);
  return value
    .split(/\s+/)
    .map((word) => {
      if (acronyms.has(word.toUpperCase())) return word.toUpperCase();
      return word
        .toLowerCase()
        .replace(/(^|[-'./])([a-z])/g, (_, prefix: string, letter: string) => {
          return `${prefix}${letter.toUpperCase()}`;
        });
    })
    .join(" ");
}
