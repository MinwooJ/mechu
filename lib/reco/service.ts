import fs from "node:fs";
import path from "node:path";

import type {
  AvailabilityResponse,
  RandomnessLevel,
  RecommendationEvent,
  RecommendationItem,
  RecommendationRequest,
  RecommendationResponse,
} from "./types";

type Candidate = RecommendationItem & { score: number };

type GoogleNearbySearchResponse = {
  results?: Array<{
    place_id?: string;
    name?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    types?: string[];
    price_level?: number;
    rating?: number;
    opening_hours?: { open_now?: boolean };
  }>;
};

const DEFAULT_LIMIT = Number(process.env.RECO_DEFAULT_LIMIT ?? "8");
const MAX_LIMIT = Number(process.env.RECO_MAX_LIMIT ?? "20");
const DAILY_LIMIT = Number(process.env.RECO_DAILY_LIMIT ?? "1000");
const EVENTS_LOG_PATH = process.env.RECO_EVENTS_LOG_PATH ?? "./data/reco/events.jsonl";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

const UNSUPPORTED = new Set(
  (process.env.RECO_UNSUPPORTED_COUNTRIES ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean),
);

const quota = { day: utcDay(), used: 0 };

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureQuotaDay() {
  const day = utcDay();
  if (quota.day !== day) {
    quota.day = day;
    quota.used = 0;
  }
}

function remainingQuota(): number {
  ensureQuotaDay();
  return Math.max(DAILY_LIMIT - quota.used, 0);
}

function consumeQuota(amount = 1): boolean {
  ensureQuotaDay();
  if (quota.used + amount > DAILY_LIMIT) {
    return false;
  }
  quota.used += amount;
  return true;
}

function isSupportedCountry(countryCode?: string | null): boolean {
  if (!countryCode) {
    return true;
  }
  return !UNSUPPORTED.has(countryCode.toUpperCase());
}

function hashSeed(input: string): number {
  let out = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    out ^= input.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return Math.abs(out >>> 0);
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseScale(level: RandomnessLevel): number {
  if (level === "stable") return 0.06;
  if (level === "explore") return 0.26;
  return 0.14;
}

function modeAffinity(mode: "lunch" | "dinner", category: string): number {
  const lunch = new Set(["fast_food", "noodle", "korean", "japanese", "cafe"]);
  const dinner = new Set(["bbq", "western", "korean", "chinese", "japanese"]);
  if (mode === "lunch") return lunch.has(category) ? 0.18 : 0.04;
  return dinner.has(category) ? 0.18 : 0.04;
}

function offsetLatLng(baseLat: number, baseLng: number, angle: number, meters: number) {
  const deltaLat = (meters * Math.cos(angle)) / 111320;
  const lngDiv = 111320 * Math.max(Math.cos((baseLat * Math.PI) / 180), 0.2);
  const deltaLng = (meters * Math.sin(angle)) / lngDiv;
  return { lat: baseLat + deltaLat, lng: baseLng + deltaLng };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

function mapGoogleCategory(types: string[] | undefined): string {
  if (!types || types.length === 0) return "restaurant";
  if (types.includes("cafe")) return "cafe";
  if (types.includes("meal_takeaway") || types.includes("fast_food")) return "fast_food";
  if (types.includes("bar") || types.includes("night_club")) return "western";
  if (types.includes("restaurant")) return "restaurant";
  return types[0];
}

function buildReasons(candidate: Candidate, distScore: number, modeScore: number): string[] {
  const reasons: string[] = [];
  if (distScore > 0.75) reasons.push("Near your location");
  if (modeScore >= 0.18) reasons.push("Fits your time-of-day preference");
  if (candidate.open_now) reasons.push("Open now");
  if (candidate.rating >= 4.4) reasons.push("Highly rated");
  return reasons.slice(0, 3);
}

function buildMockCandidates(req: Required<RecommendationRequest>): Candidate[] {
  const categories = ["korean", "japanese", "chinese", "western", "cafe", "fast_food", "bbq", "noodle"];
  const seedInput = `${req.lat}:${req.lng}:${req.radius_m}:${req.mode}`;
  const rnd = mulberry32(hashSeed(seedInput));
  const total = Math.max(req.limit * 6, 36);
  const out: Candidate[] = [];

  for (let idx = 0; idx < total; idx += 1) {
    const angle = rnd() * Math.PI * 2;
    const dist = 80 + rnd() * (req.radius_m * 1.3 - 80);
    const point = offsetLatLng(req.lat, req.lng, angle, dist);
    const category = categories[Math.floor(rnd() * categories.length)];
    out.push({
      place_id: `mock_${hashSeed(seedInput)}_${idx}`,
      name: `${category.replace("_", " ")} spot ${idx + 1}`,
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
      distance_m: Math.floor(dist),
      category,
      price_level: 1 + Math.floor(rnd() * 4),
      rating: Number((3.3 + rnd() * 1.6).toFixed(1)),
      open_now: rnd() > 0.25,
      why: [],
      directions_url: "",
      score: 0,
    });
  }

  return out;
}

async function fetchGoogleCandidates(req: Required<RecommendationRequest>): Promise<Candidate[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    return [];
  }

  const params = new URLSearchParams({
    key: GOOGLE_MAPS_API_KEY,
    location: `${req.lat},${req.lng}`,
    radius: String(req.radius_m),
    type: "restaurant",
    language: "ko",
  });

  if (req.open_now) {
    params.set("opennow", "true");
  }

  const response = await fetch(`${GOOGLE_PLACES_BASE}?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GoogleNearbySearchResponse;
  const results = payload.results ?? [];
  const out: Candidate[] = [];

  for (const r of results) {
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    const placeId = r.place_id;
    const name = r.name;
    if (!lat || !lng || !placeId || !name) {
      continue;
    }

    const distance = haversineMeters(req.lat, req.lng, lat, lng);
    out.push({
      place_id: placeId,
      name,
      lat,
      lng,
      distance_m: distance,
      category: mapGoogleCategory(r.types),
      price_level: Math.max(1, Math.min(r.price_level ?? 2, 4)),
      rating: Math.max(0, Math.min(r.rating ?? 4, 5)),
      open_now: r.opening_hours?.open_now ?? true,
      why: [],
      directions_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
      score: 0,
    });
  }

  return out;
}

function weightedPick<T>(items: T[], weights: number[], rnd: () => number): T {
  const total = weights.reduce((acc, v) => acc + v, 0);
  let target = rnd() * total;
  for (let i = 0; i < items.length; i += 1) {
    target -= weights[i];
    if (target <= 0) return items[i];
  }
  return items[items.length - 1];
}

function sanitizeRequest(input: RecommendationRequest): Required<RecommendationRequest> {
  return {
    lat: input.lat,
    lng: input.lng,
    mode: input.mode,
    radius_m: Math.max(100, Math.min(input.radius_m ?? 1000, 5000)),
    limit: Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
    categories: (input.categories ?? []).map((v) => v.toLowerCase()),
    price_levels: (input.price_levels ?? []).filter((v) => v >= 1 && v <= 4),
    open_now: Boolean(input.open_now),
    randomness_level: input.randomness_level ?? "balanced",
    exclude_place_ids: input.exclude_place_ids ?? [],
    recently_shown_place_ids: input.recently_shown_place_ids ?? [],
    country_code: input.country_code ?? null,
    session_id: input.session_id ?? null,
  };
}

export function getAvailability(countryCode?: string | null): AvailabilityResponse {
  const supported = isSupportedCountry(countryCode);
  return {
    supported,
    reason: supported ? null : "Region is currently unsupported.",
    remaining_daily_quota: remainingQuota(),
  };
}

export async function getRecommendations(input: RecommendationRequest): Promise<RecommendationResponse> {
  const req = sanitizeRequest(input);
  if (!isSupportedCountry(req.country_code)) {
    return {
      status: "unsupported_region",
      message: "This region is currently unsupported.",
      mode: req.mode,
      remaining_daily_quota: remainingQuota(),
      recommendations: [],
    };
  }
  if (!consumeQuota()) {
    return {
      status: "quota_exceeded",
      message: "Daily free recommendation limit reached.",
      mode: req.mode,
      remaining_daily_quota: 0,
      recommendations: [],
    };
  }

  let candidates = await fetchGoogleCandidates(req);
  if (candidates.length === 0) {
    candidates = buildMockCandidates(req);
  }

  const excluded = new Set(req.exclude_place_ids);
  const recent = new Set(req.recently_shown_place_ids);
  const catFilter = new Set(req.categories);
  const priceFilter = new Set(req.price_levels);
  const rnd = mulberry32(hashSeed(`${Date.now()}_${req.lat}_${req.lng}_${req.mode}`));
  const nScale = noiseScale(req.randomness_level);

  const filtered = candidates.filter((c) => {
    if (c.distance_m > req.radius_m) return false;
    if (excluded.has(c.place_id)) return false;
    if (catFilter.size > 0 && !catFilter.has(c.category)) return false;
    if (priceFilter.size > 0 && !priceFilter.has(c.price_level)) return false;
    if (req.open_now && !c.open_now) return false;
    return true;
  });

  for (const c of filtered) {
    const distScore = Math.max(0, 1 - c.distance_m / req.radius_m);
    const ratingScore = c.rating / 5;
    const mScore = modeAffinity(req.mode, c.category);
    const openScore = c.open_now ? 0.15 : 0;
    const repeatPenalty = recent.has(c.place_id) ? 0.25 : 0;
    const noise = rnd() * nScale;
    c.score = distScore * 0.55 + ratingScore * 0.2 + mScore + openScore + noise - repeatPenalty;
    c.why = buildReasons(c, distScore, mScore);
    c.directions_url = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`;
  }

  filtered.sort((a, b) => b.score - a.score);
  let pool = filtered.slice(0, Math.min(filtered.length, Math.max(req.limit, req.limit * 3)));
  const selected: Candidate[] = [];

  while (pool.length > 0 && selected.length < req.limit) {
    const weights = pool.map((v) => Math.max(v.score, 0.01));
    const picked = weightedPick(pool, weights, rnd);
    selected.push(picked);
    pool = pool.filter((v) => v.place_id !== picked.place_id).map((v) => {
      if (v.category === picked.category) {
        return { ...v, score: v.score * 0.9 };
      }
      return v;
    });
  }

  return {
    status: "ok",
    mode: req.mode,
    remaining_daily_quota: remainingQuota(),
    recommendations: selected.map(({ score, ...rest }) => rest),
  };
}

export function recordEvent(event: RecommendationEvent): void {
  const absolute = path.resolve(EVENTS_LOG_PATH);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const payload = { ...event, ts: new Date().toISOString() };
  fs.appendFileSync(absolute, `${JSON.stringify(payload)}\n`, "utf-8");
}
