import { NextResponse } from "next/server";

type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{ short_name?: string; types?: string[] }>;
  }>;
};

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const GOOGLE_GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const GEOCODE_TIMEOUT_MS = Math.max(2000, Math.min(Number(process.env.GEOCODE_TIMEOUT_MS ?? "8000"), 20000));

function readCountryCode(
  components?: Array<{ short_name?: string; types?: string[] }>,
): string | null {
  if (!components) return null;
  const country = components.find((c) => (c.types ?? []).includes("country"))?.short_name;
  return country ? country.toUpperCase() : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ ok: false, reason: "query_too_short" }, { status: 400 });
  }
  if (q.length > 160) {
    return NextResponse.json({ ok: false, reason: "query_too_long" }, { status: 400 });
  }
  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ ok: false, reason: "missing_api_key" }, { status: 503 });
  }

  const params = new URLSearchParams({
    address: q,
    key: GOOGLE_MAPS_API_KEY,
  });

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    response = await fetch(`${GOOGLE_GEOCODE_BASE}?${params.toString()}`, { signal: controller.signal });
  } catch {
    return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  }

  const payload = (await response.json()) as GoogleGeocodeResponse;
  const status = payload.status ?? "";
  if (status === "ZERO_RESULTS") {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (status !== "OK") {
    return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  }

  const first = payload.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    lat,
    lng,
    label: first?.formatted_address ?? q,
    country_code: readCountryCode(first?.address_components),
  });
}
