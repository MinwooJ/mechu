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

async function fetchGeocode(params: URLSearchParams): Promise<GoogleGeocodeResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const response = await fetch(`${GOOGLE_GEOCODE_BASE}?${params.toString()}`, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as GoogleGeocodeResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const isReverse = latParam !== null && lngParam !== null;

  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ ok: false, reason: "missing_api_key" }, { status: 503 });
  }

  if (isReverse) {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, reason: "invalid_coordinates" }, { status: 400 });
    }

    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      result_type: "country",
      key: GOOGLE_MAPS_API_KEY,
    });

    const payload = await fetchGeocode(params);
    if (!payload) {
      return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
    }

    const status = payload.status ?? "";
    if (status === "ZERO_RESULTS") {
      return NextResponse.json({ ok: true, lat, lng, country_code: null });
    }
    if (status !== "OK") {
      return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
    }

    const first = payload.results?.[0];
    return NextResponse.json({
      ok: true,
      lat,
      lng,
      country_code: readCountryCode(first?.address_components),
    });
  }

  if (q.length < 2) {
    return NextResponse.json({ ok: false, reason: "query_too_short" }, { status: 400 });
  }
  if (q.length > 160) {
    return NextResponse.json({ ok: false, reason: "query_too_long" }, { status: 400 });
  }

  const params = new URLSearchParams({
    address: q,
    key: GOOGLE_MAPS_API_KEY,
  });

  const payload = await fetchGeocode(params);
  if (!payload) {
    return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  }

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
