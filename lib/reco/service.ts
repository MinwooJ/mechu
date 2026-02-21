import { promises as fs } from "node:fs";
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
type ProviderState = "ok" | "error" | "unavailable";
type ProviderCandidates = { items: Candidate[]; state: ProviderState };
type VibeMode = "safe" | "hot" | "explore";

type GoogleNearbySearchResponse = {
  status?: string;
  error_message?: string;
  next_page_token?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    vicinity?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    types?: string[];
    price_level?: number;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: { open_now?: boolean };
    business_status?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  }>;
};

type KakaoCategorySearchResponse = {
  meta?: {
    is_end?: boolean;
    pageable_count?: number;
    total_count?: number;
  };
  documents?: Array<{
    id?: string;
    place_name?: string;
    road_address_name?: string;
    address_name?: string;
    category_name?: string;
    x?: string;
    y?: string;
    distance?: string;
    place_url?: string;
  }>;
};

const DEFAULT_LIMIT = Number(process.env.RECO_DEFAULT_LIMIT ?? "8");
const MAX_LIMIT = Number(process.env.RECO_MAX_LIMIT ?? "20");
const EVENTS_LOG_PATH = process.env.RECO_EVENTS_LOG_PATH ?? "./data/reco/events.jsonl";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY ?? "";
const KAKAO_LOCAL_CATEGORY_BASE = "https://dapi.kakao.com/v2/local/search/category.json";
const GOOGLE_NEARBY_MAX_PAGES = Math.max(1, Math.min(Number(process.env.GOOGLE_NEARBY_MAX_PAGES ?? "3"), 3));
const KAKAO_CATEGORY_MAX_PAGES = Math.max(1, Math.min(Number(process.env.KAKAO_CATEGORY_MAX_PAGES ?? "15"), 45));
const SOURCE_MAX_CANDIDATES = Math.max(30, Math.min(Number(process.env.RECO_SOURCE_MAX_CANDIDATES ?? "300"), 1000));
const PROVIDER_TIMEOUT_MS = Math.max(2000, Math.min(Number(process.env.RECO_PROVIDER_TIMEOUT_MS ?? "8000"), 20000));

const UNSUPPORTED = new Set(
  (process.env.RECO_UNSUPPORTED_COUNTRIES ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean),
);

function sanitizeCountryCode(input?: string | null): string | null {
  if (!input) return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function googleLanguageForCountry(countryCode?: string | null): string {
  const code = sanitizeCountryCode(countryCode);
  if (code === "KR") return "ko";
  if (code === "JP") return "ja";
  if (code === "TW" || code === "HK" || code === "MO") return "zh-TW";
  return "en";
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

function modeAffinity(mode: "lunch" | "dinner", category: string): number {
  const lunch = new Set(["fast_food", "street_food", "noodle", "korean", "japanese", "cafe"]);
  const dinner = new Set(["bbq", "chicken", "western", "korean", "chinese", "japanese"]);
  if (mode === "lunch") return lunch.has(category) ? 0.18 : 0.04;
  return dinner.has(category) ? 0.18 : 0.04;
}

function noiseScale(level: RandomnessLevel): number {
  if (level === "stable") return 0.06;
  if (level === "explore") return 0.26;
  return 0.14;
}

function mapVibe(level: RandomnessLevel): VibeMode {
  if (level === "stable") return "safe";
  if (level === "explore") return "explore";
  return "hot";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function mapGoogleCategory(types: string[] | undefined): string {
  if (!types || types.length === 0) return "restaurant";
  if (types.includes("cafe")) return "cafe";
  if (types.includes("meal_takeaway") || types.includes("fast_food")) return "fast_food";
  if (types.includes("bar") || types.includes("night_club")) return "western";
  if (types.includes("chicken_restaurant")) return "chicken";
  if (types.includes("barbecue_restaurant")) return "bbq";
  if (types.includes("japanese_restaurant") || types.includes("sushi_restaurant") || types.includes("ramen_restaurant"))
    return "japanese";
  if (types.includes("chinese_restaurant")) return "chinese";
  if (types.includes("korean_restaurant")) return "korean";
  if (types.includes("noodle_restaurant")) return "noodle";
  if (types.includes("restaurant")) return "restaurant";
  return types[0];
}

function leafCategoryLabel(raw: string): string {
  return raw
    .split(">")
    .map((v) => v.trim())
    .filter(Boolean)
    .pop() ?? raw.trim();
}

function rawGoogleCategory(types: string[] | undefined): string {
  if (!types || types.length === 0) return "restaurant";

  const ignore = new Set(["point_of_interest", "establishment", "food", "meal_takeaway", "meal_delivery"]);
  const preferred =
    types.find((t) => !ignore.has(t) && t !== "restaurant") ??
    types.find((t) => !ignore.has(t)) ??
    types[0];

  return preferred.replaceAll("_", " ").trim();
}

type CategoryHint = {
  raw: string;
  category: string;
};

function inferGoogleCategoryFromText(text: string): CategoryHint | null {
  const source = text.toLowerCase();
  if (!source.trim()) return null;

  const hints: Array<{ raw: string; category: string; patterns: RegExp[] }> = [
    { raw: "ramen", category: "japanese", patterns: [/ramen/, /라멘/, /라면/] },
    { raw: "sushi", category: "japanese", patterns: [/sushi/, /초밥/, /스시/, /회전초밥/] },
    { raw: "izakaya", category: "japanese", patterns: [/izakaya/, /이자카야/, /오마카세/] },
    { raw: "pizza", category: "western", patterns: [/pizza/, /피자/] },
    { raw: "burger", category: "fast_food", patterns: [/burger/, /버거/, /햄버거/] },
    { raw: "steak", category: "western", patterns: [/steak/, /스테이크/] },
    { raw: "pasta", category: "western", patterns: [/pasta/, /파스타/] },
    { raw: "bbq", category: "bbq", patterns: [/bbq/, /barbecue/, /바베큐/, /고기/, /구이/, /갈비/] },
    { raw: "chicken", category: "chicken", patterns: [/chicken/, /치킨/, /닭/] },
    { raw: "street food", category: "street_food", patterns: [/분식/, /떡볶이/, /순대/, /튀김/, /포장마차/] },
    { raw: "noodle", category: "noodle", patterns: [/noodle/, /국수/, /면/, /우동/, /soba/, /쌀국수/, /pho/] },
    { raw: "korean", category: "korean", patterns: [/korean/, /한식/, /국밥/, /비빔밥/, /김밥/, /찌개/] },
    { raw: "chinese", category: "chinese", patterns: [/chinese/, /중식/, /짜장/, /짬뽕/, /마라/] },
    { raw: "cafe", category: "cafe", patterns: [/cafe/, /coffee/, /카페/, /커피/, /베이커리/, /bakery/] },
  ];

  for (const hint of hints) {
    if (hint.patterns.some((pattern) => pattern.test(source))) {
      return { raw: hint.raw, category: hint.category };
    }
  }
  return null;
}

function normalizeGoogleTypeLabel(type: string): string {
  return type.replace(/_restaurant$/, "").replaceAll("_", " ").trim();
}

function googleCategoryHint(types: string[] | undefined, name?: string, address?: string): CategoryHint | null {
  if (!types || types.length === 0) {
    return inferGoogleCategoryFromText(`${name ?? ""} ${address ?? ""}`.trim());
  }

  const typeMap: Record<string, CategoryHint> = {
    cafe: { raw: "cafe", category: "cafe" },
    bakery: { raw: "bakery", category: "cafe" },
    fast_food: { raw: "fast food", category: "fast_food" },
    chicken_restaurant: { raw: "chicken", category: "chicken" },
    barbecue_restaurant: { raw: "bbq", category: "bbq" },
    korean_restaurant: { raw: "korean", category: "korean" },
    japanese_restaurant: { raw: "japanese", category: "japanese" },
    ramen_restaurant: { raw: "ramen", category: "japanese" },
    sushi_restaurant: { raw: "sushi", category: "japanese" },
    chinese_restaurant: { raw: "chinese", category: "chinese" },
    noodle_restaurant: { raw: "noodle", category: "noodle" },
  };

  for (const type of types) {
    if (typeMap[type]) return typeMap[type];
  }

  const specificType = types.find(
    (type) =>
      type.endsWith("_restaurant") &&
      type !== "restaurant" &&
      type !== "meal_takeaway" &&
      type !== "meal_delivery" &&
      type !== "food",
  );
  if (specificType) {
    const normalized = normalizeGoogleTypeLabel(specificType);
    return { raw: normalized, category: mapGoogleCategory(types) };
  }

  return inferGoogleCategoryFromText(`${name ?? ""} ${address ?? ""}`.trim());
}

function mapKakaoCategory(categoryName?: string): string {
  const lower = (categoryName ?? "").toLowerCase();
  if (lower.includes("카페")) return "cafe";
  if (lower.includes("분식")) return "street_food";
  if (lower.includes("패스트")) return "fast_food";
  if (lower.includes("치킨")) return "chicken";
  if (lower.includes("일식")) return "japanese";
  if (lower.includes("중식")) return "chinese";
  if (lower.includes("양식")) return "western";
  if (lower.includes("한식")) return "korean";
  if (lower.includes("고기")) return "bbq";
  if (lower.includes("국수") || lower.includes("면")) return "noodle";
  return "restaurant";
}

function buildReasons(candidate: Candidate, distScore: number, modeScore: number, popularityScore: number, vibe: VibeMode): string[] {
  const reasons: string[] = [];
  if (distScore > 0.75) reasons.push("Near your location");
  if (modeScore >= 0.18) reasons.push("Fits your time-of-day preference");
  if (popularityScore >= 0.7) reasons.push("Popular now");
  if (candidate.open_now) reasons.push("Open now");
  if (vibe === "explore" && popularityScore < 0.45) reasons.push("Hidden gem pick");
  if (candidate.rating >= 4.4) reasons.push("Highly rated");
  return reasons.slice(0, 3);
}

async function fetchGoogleCandidates(req: Required<RecommendationRequest>): Promise<ProviderCandidates> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { items: [], state: "unavailable" };
  }

  const all: NonNullable<GoogleNearbySearchResponse["results"]> = [];
  const seen = new Set<string>();
  let nextPageToken: string | undefined;
  let hadSuccess = false;

  for (let page = 1; page <= GOOGLE_NEARBY_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      language: googleLanguageForCountry(req.country_code),
    });
    const region = sanitizeCountryCode(req.country_code)?.toLowerCase();
    if (region) params.set("region", region);

    if (page === 1) {
      params.set("location", `${req.lat},${req.lng}`);
      params.set("radius", String(req.radius_m));
      params.set("type", "restaurant");
    } else if (nextPageToken) {
      // Google next_page_token is not instantly active.
      await sleep(1800);
      params.set("pagetoken", nextPageToken);
    } else {
      break;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(`${GOOGLE_PLACES_BASE}?${params.toString()}`);
    } catch {
      if (hadSuccess) break;
      return { items: [], state: "error" };
    }

    if (!response.ok) {
      if (hadSuccess) break;
      return { items: [], state: "error" };
    }

    const payload = (await response.json()) as GoogleNearbySearchResponse;
    const status = payload.status ?? "OK";
    const allowed = status === "OK" || status === "ZERO_RESULTS";
    if (!allowed) {
      if (page > 1 && status === "INVALID_REQUEST" && hadSuccess) {
        break;
      }
      if (hadSuccess) break;
      return { items: [], state: "error" };
    }

    hadSuccess = true;
    const results = payload.results ?? [];
    nextPageToken = payload.next_page_token;

    for (const r of results) {
      const key = r.place_id ?? `${r.name}_${r.geometry?.location?.lat}_${r.geometry?.location?.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(r);
      if (all.length >= SOURCE_MAX_CANDIDATES) break;
    }

    if (!nextPageToken || all.length >= SOURCE_MAX_CANDIDATES) {
      break;
    }
  }

  const out: Candidate[] = [];

  for (const r of all ?? []) {
    if (r.business_status === "CLOSED_TEMPORARILY" || r.business_status === "CLOSED_PERMANENTLY") {
      continue;
    }

    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    const placeId = r.place_id;
    const name = r.name;
    if (!lat || !lng || !placeId || !name) {
      continue;
    }

    const distance = haversineMeters(req.lat, req.lng, lat, lng);
    const hint = googleCategoryHint(r.types, name, r.vicinity ?? "");
    const mappedCategory = hint?.category ?? mapGoogleCategory(r.types);
    out.push({
      place_id: placeId,
      name,
      address: r.vicinity ?? "",
      raw_category: hint?.raw ?? rawGoogleCategory(r.types),
      lat,
      lng,
      distance_m: distance,
      category: mappedCategory,
      price_level: Math.max(1, Math.min(r.price_level ?? 2, 4)),
      rating: Math.max(0, Math.min(r.rating ?? 4, 5)),
      review_count: Math.max(0, r.user_ratings_total ?? 0),
      // Do not assume "open now" when provider does not return operating-hour status.
      open_now: r.opening_hours?.open_now === true,
      why: [],
      directions_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
      score: 0,
    });
  }

  return { items: out, state: "ok" };
}

async function fetchKakaoCandidates(req: Required<RecommendationRequest>): Promise<ProviderCandidates> {
  if (!KAKAO_REST_API_KEY) {
    return { items: [], state: "unavailable" };
  }

  const perPage = 15;
  const docs: NonNullable<KakaoCategorySearchResponse["documents"]> = [];
  const seen = new Set<string>();
  let hadSuccess = false;
  let hadError = false;
  const extraCenters: Array<{ lat: number; lng: number }> = [];

  if (req.radius_m >= 2500) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      extraCenters.push(offsetLatLng(req.lat, req.lng, angle, req.radius_m * 0.72));
    }
  } else if (req.radius_m >= 1500) {
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI * 2 * i) / 4;
      extraCenters.push(offsetLatLng(req.lat, req.lng, angle, req.radius_m * 0.65));
    }
  }

  const centers = [{ lat: req.lat, lng: req.lng }, ...extraCenters];

  for (let centerIndex = 0; centerIndex < centers.length; centerIndex += 1) {
    const center = centers[centerIndex];
    const pageLimit = centerIndex === 0 ? KAKAO_CATEGORY_MAX_PAGES : 1;

    for (let page = 1; page <= pageLimit; page += 1) {
      const params = new URLSearchParams({
        category_group_code: "FD6",
        x: String(center.lng),
        y: String(center.lat),
        radius: String(Math.min(req.radius_m, 20000)),
        sort: "distance",
        size: String(perPage),
        page: String(page),
      });

      let response: Response;
      try {
        response = await fetchWithTimeout(`${KAKAO_LOCAL_CATEGORY_BASE}?${params.toString()}`, {
          headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
        });
      } catch {
        hadError = true;
        continue;
      }
      if (!response.ok) {
        hadError = true;
        continue;
      }
      hadSuccess = true;

      const payload = (await response.json()) as KakaoCategorySearchResponse;
      const pageDocs = payload.documents ?? [];
      for (const doc of pageDocs) {
        const key = doc.id ?? `${doc.place_name}_${doc.x}_${doc.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        docs.push(doc);
        if (docs.length >= SOURCE_MAX_CANDIDATES) break;
      }

      if (docs.length >= SOURCE_MAX_CANDIDATES || payload.meta?.is_end || pageDocs.length < perPage) {
        break;
      }
    }
    if (docs.length >= SOURCE_MAX_CANDIDATES) break;
  }
  const out: Candidate[] = [];

  for (const doc of docs) {
    const name = doc.place_name;
    const placeId = doc.id;
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    if (!name || !placeId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    // Always compute distance from the user's selected search point.
    // Kakao `doc.distance` is relative to each query center and can be inconsistent
    // when we fan out to multiple centers for wider coverage.
    const safeDistance = haversineMeters(req.lat, req.lng, lat, lng);

    out.push({
      place_id: `kakao_${placeId}`,
      name,
      address: doc.road_address_name || doc.address_name || "",
      raw_category: leafCategoryLabel(doc.category_name || "음식점"),
      lat,
      lng,
      distance_m: Math.round(safeDistance),
      category: mapKakaoCategory(doc.category_name),
      price_level: 2,
      rating: 4,
      review_count: undefined,
      // Kakao category search response does not provide reliable open/closed status.
      open_now: false,
      why: [],
      directions_url: doc.place_url || `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`,
      score: 0,
    });
  }

  if (!hadSuccess && hadError) {
    return { items: [], state: "error" };
  }
  return { items: out, state: "ok" };
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
  const countryCode = sanitizeCountryCode(input.country_code);
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
    country_code: countryCode,
    session_id: input.session_id ?? null,
  };
}

export function getAvailability(countryCode?: string | null): AvailabilityResponse {
  const supported = isSupportedCountry(countryCode);
  return {
    supported,
    reason: supported ? null : "Region is currently unsupported.",
  };
}

export async function getRecommendations(input: RecommendationRequest): Promise<RecommendationResponse> {
  const req = sanitizeRequest(input);
  if (!isSupportedCountry(req.country_code)) {
    return {
      status: "unsupported_region",
      message: "This region is currently unsupported.",
      mode: req.mode,
      recommendations: [],
    };
  }

  const useKakaoPrimary = req.country_code === "KR" && Boolean(KAKAO_REST_API_KEY);
  const attempts: ProviderCandidates[] = [];
  let candidates: Candidate[] = [];

  if (useKakaoPrimary) {
    const kakao = await fetchKakaoCandidates(req);
    attempts.push(kakao);
    candidates = kakao.items;

    if (candidates.length === 0 || req.open_now) {
      const google = await fetchGoogleCandidates(req);
      attempts.push(google);
      candidates = req.open_now ? google.items : candidates.length === 0 ? google.items : candidates;
    }
  } else {
    const google = await fetchGoogleCandidates(req);
    attempts.push(google);
    candidates = google.items;
  }

  if (candidates.length === 0) {
    const hasSuccessfulLookup = attempts.some((a) => a.state === "ok");
    if (!hasSuccessfulLookup) {
      return {
        status: "source_error",
        message: "Places provider is temporarily unavailable.",
        mode: req.mode,
        recommendations: [],
      };
    }
    return {
      status: "ok",
      mode: req.mode,
      recommendations: [],
    };
  }

  const excluded = new Set(req.exclude_place_ids);
  const recent = new Set(req.recently_shown_place_ids);
  const catFilter = new Set(req.categories);
  const priceFilter = new Set(req.price_levels);
  const rnd = mulberry32(hashSeed(`${Date.now()}_${req.lat}_${req.lng}_${req.mode}`));
  const nScale = noiseScale(req.randomness_level);
  const vibe = mapVibe(req.randomness_level);
  const filtered = candidates.filter((c) => {
    if (c.distance_m > req.radius_m) return false;
    if (excluded.has(c.place_id)) return false;
    if (catFilter.size > 0 && !catFilter.has(c.category)) return false;
    if (priceFilter.size > 0 && !priceFilter.has(c.price_level)) return false;
    if (req.open_now && !c.open_now) return false;
    return true;
  });

  const categoryFreq = new Map<string, number>();
  let maxReviewCount = 0;
  for (const c of filtered) {
    categoryFreq.set(c.category, (categoryFreq.get(c.category) ?? 0) + 1);
    maxReviewCount = Math.max(maxReviewCount, Math.max(0, c.review_count ?? 0));
  }

  for (const c of filtered) {
    const distScore = Math.max(0, 1 - c.distance_m / req.radius_m);
    const ratingScore = c.rating / 5;
    const mScore = modeAffinity(req.mode, c.category);
    const typeFit = mScore >= 0.18 ? 1 : 0.35;
    const openScore = c.open_now ? 1 : 0;
    const reviewCount = Math.max(0, c.review_count ?? 0);
    const popularityScore =
      maxReviewCount > 0
        ? Math.min(1, Math.log1p(reviewCount) / Math.log1p(maxReviewCount))
        : c.place_id.startsWith("kakao_")
          ? 0.35
          : 0.45;
    const noveltyScore = recent.has(c.place_id) ? 0 : 1;
    const categoryCount = categoryFreq.get(c.category) ?? 1;
    const rarityScore = 1 / Math.sqrt(categoryCount);
    const repeatPenalty = recent.has(c.place_id) ? 0.25 : 0;
    const noise = rnd() * nScale;

    let vibeScore = 0;
    if (vibe === "safe") {
      vibeScore = ratingScore * 0.34 + popularityScore * 0.28 + openScore * 0.2 + typeFit * 0.12 + noveltyScore * 0.06;
    } else if (vibe === "hot") {
      vibeScore = popularityScore * 0.32 + ratingScore * 0.24 + openScore * 0.16 + typeFit * 0.18 + noveltyScore * 0.1;
    } else {
      vibeScore = noveltyScore * 0.3 + rarityScore * 0.3 + typeFit * 0.22 + ratingScore * 0.18;
    }

    // Distance is intentionally excluded from ranking; radius filter already constrains candidates.
    c.score = vibeScore + noise - repeatPenalty;
    c.why = buildReasons(c, distScore, mScore, popularityScore, vibe);
    c.directions_url = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`;
  }

  filtered.sort((a, b) => b.score - a.score);
  let pool = [...filtered];
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
    recommendations: selected.map(({ score, ...rest }) => rest),
  };
}

export async function recordEvent(event: RecommendationEvent): Promise<void> {
  const absolute = path.resolve(EVENTS_LOG_PATH);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const payload = { ...event, ts: new Date().toISOString() };
  await fs.appendFile(absolute, `${JSON.stringify(payload)}\n`, "utf-8");
}
