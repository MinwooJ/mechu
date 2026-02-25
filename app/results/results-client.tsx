"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { getSessionId, loadFlowState, resolveFlowCountryCode, saveFlowState, type FlowState } from "@/lib/flow/state";
import { inferSearchCountry, normalizeCountryCode, parseLatLng } from "@/lib/geo/location";
import { useLocale, useLocaleHref, useT } from "@/lib/i18n/client";
import { formatDistance, formatRadius } from "@/lib/i18n/format";
import type {
  AvailabilityResponse,
  RandomnessLevel,
  RecommendationItem,
  RecommendationResponse,
  RecommendMode,
} from "@/lib/reco/types";

type Position = { lat: number; lng: number };
type MapProvider = "osm" | "kakao";
type MapFocusTarget = "selected" | "origin";
type GeocodeResponse = {
  ok: boolean;
  lat?: number;
  lng?: number;
  label?: string;
  country_code?: string | null;
  reason?: string;
};
type PreviewPoint = {
  lat: number;
  lng: number;
  label?: string;
  countryCode?: string;
};

const InteractiveMap = dynamic(() => import("./interactive-map"), { ssr: false });
const KakaoMap = dynamic(() => import("./kakao-map"), { ssr: false });
const LocationPicker = dynamic(() => import("@/app/onboarding/location-picker"), { ssr: false });

const HAS_KAKAO_KEY = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY);
const VIBE_OPTIONS: Array<{ value: RandomnessLevel; titleKey: string; descKey: string }> = [
  { value: "stable", titleKey: "results.vibe.stable", descKey: "results.vibeDesc.stable" },
  { value: "balanced", titleKey: "results.vibe.balanced", descKey: "results.vibeDesc.balanced" },
  { value: "explore", titleKey: "results.vibe.explore", descKey: "results.vibeDesc.explore" },
];

const LOADING_MESSAGE_KEYS = [
  "results.loading.msg1",
  "results.loading.msg2",
  "results.loading.msg3",
  "results.loading.msg4",
  "results.loading.msg5",
  "results.loading.msg6",
  "results.loading.msg7",
  "results.loading.msg8",
  "results.loading.msg9",
  "results.loading.msg10",
] as const;
const UNKNOWN_REASON_LOGGED = new Set<string>();
const RESULTS_CACHE_KEY = "meal_reco_results_cache_v1";
const RESULTS_CACHE_TTL_MS = 10 * 60 * 1000;
const RESULTS_CACHE_MAX_ENTRIES = 8;
const MOBILE_CARD_AREA_HEIGHT = 190;

type ResultsCacheEntry = {
  savedAt: number;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
};

type ResultsCacheStore = Record<string, ResultsCacheEntry>;

function buildResultsFlowKey(flow: FlowState): string | null {
  if (!flow.position) return null;

  const country = resolveFlowCountryCode(flow);
  return [
    country,
    flow.mode,
    String(flow.radius),
    flow.randomness,
    flow.position.lat.toFixed(5),
    flow.position.lng.toFixed(5),
  ].join("|");
}

function readResultsCache(flowKey: string): ResultsCacheEntry | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(RESULTS_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ResultsCacheStore;
    const entry = parsed[flowKey];
    if (!entry) return null;

    if (Date.now() - entry.savedAt > RESULTS_CACHE_TTL_MS) {
      delete parsed[flowKey];
      window.sessionStorage.setItem(RESULTS_CACHE_KEY, JSON.stringify(parsed));
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

function writeResultsCache(flowKey: string, items: RecommendationItem[], selectedPlaceId: string | null): void {
  if (typeof window === "undefined") return;

  let store: ResultsCacheStore = {};
  try {
    const raw = window.sessionStorage.getItem(RESULTS_CACHE_KEY);
    if (raw) {
      store = JSON.parse(raw) as ResultsCacheStore;
    }
  } catch {
    store = {};
  }

  const now = Date.now();
  for (const [key, entry] of Object.entries(store)) {
    if (!entry || now - entry.savedAt > RESULTS_CACHE_TTL_MS) {
      delete store[key];
    }
  }

  store[flowKey] = {
    savedAt: now,
    items: items.slice(0, 3),
    selectedPlaceId,
  };

  const sortedKeys = Object.keys(store).sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0));
  for (const key of sortedKeys.slice(RESULTS_CACHE_MAX_ENTRIES)) {
    delete store[key];
  }

  window.sessionStorage.setItem(RESULTS_CACHE_KEY, JSON.stringify(store));
}

function naverSearchLink(item: RecommendationItem): string {
  const queryText = [item.name, item.address].filter(Boolean).join(" ");
  const query = encodeURIComponent(queryText || item.name);
  const center = `${item.lng},${item.lat},15,0,0,0,dh`;
  return `https://map.naver.com/p/search/${query}?c=${center}`;
}

function kakaoPlaceIdMapLink(item: RecommendationItem): string | null {
  if (!item.place_id.startsWith("kakao_")) return null;
  const kakaoId = item.place_id.slice("kakao_".length).trim();
  if (!kakaoId) return null;
  return `https://place.map.kakao.com/${encodeURIComponent(kakaoId)}`;
}

function googlePlaceLink(item: RecommendationItem): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}&query_place_id=${encodeURIComponent(item.place_id)}`;
}

function localizeReason(reason: string, t: (key: string) => string): string {
  const table: Record<string, string> = {
    "Near your location": t("results.reason.near"),
    "Fits your time-of-day preference": t("results.reason.time"),
    "Open now": t("results.reason.openNow"),
    "Highly rated": t("results.reason.highRated"),
    "Popular now": t("results.reason.popular"),
    "Hidden gem pick": t("results.reason.hiddenGem"),
  };
  const translated = table[reason];
  if (translated) return translated;

  if (!UNKNOWN_REASON_LOGGED.has(reason)) {
    UNKNOWN_REASON_LOGGED.add(reason);
    console.warn(`[i18n] Unmapped recommendation reason: "${reason}"`);
  }

  return reason;
}

export default function ResultsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const toLocale = useLocaleHref();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget>("selected");
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [origin, setOrigin] = useState<Position | null>(null);
  const [provider, setProvider] = useState<MapProvider>("osm");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [flowMode, setFlowMode] = useState<RecommendMode>("lunch");
  const [flowRadius, setFlowRadius] = useState(1000);
  const [flowRandomness, setFlowRandomness] = useState<RandomnessLevel>("balanced");
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<RecommendMode>("lunch");
  const [draftRadius, setDraftRadius] = useState(1000);
  const [draftRandomness, setDraftRandomness] = useState<RandomnessLevel>("balanced");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationPreview, setLocationPreview] = useState<PreviewPoint | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [geolocationLoading, setGeolocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 980px)").matches : false,
  );
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const swipeTrackRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<RecommendationItem[]>([]);
  const loadingMessages = useMemo(() => LOADING_MESSAGE_KEYS.map((key) => t(key)), [t]);
  const useKrLinks = countryCode === "KR";
  const modeLabel = flowMode === "dinner" ? t("mode.dinnerTag") : t("mode.lunchTag");
  const radiusLabel = formatRadius(flowRadius, locale);
  const vibeLabel = t(VIBE_OPTIONS.find((v) => v.value === flowRandomness)?.titleKey ?? "results.vibe.balanced");

  const selected = useMemo(() => {
    if (!selectedPlaceId) return items[0] ?? null;
    return items.find((item) => item.place_id === selectedPlaceId) ?? items[0] ?? null;
  }, [items, selectedPlaceId]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const scrollSwipeTrackToIndex = useCallback((idx: number) => {
    const track = swipeTrackRef.current;
    if (!track) return;
    const card = track.children[idx] as HTMLElement | undefined;
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  // Swipe scroll detection — detect which card is centered after scroll
  useEffect(() => {
    if (!isMobileViewport) return;
    const track = swipeTrackRef.current;
    if (!track) return;

    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const trackRect = track.getBoundingClientRect();
        const centerX = trackRect.left + trackRect.width / 2;
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i < track.children.length; i++) {
          const child = track.children[i] as HTMLElement;
          const childRect = child.getBoundingClientRect();
          const childCenterX = childRect.left + childRect.width / 2;
          const dist = Math.abs(childCenterX - centerX);
          if (dist < closestDist) {
            closestDist = dist;
            closest = i;
          }
        }
        setActiveCardIndex(closest);
        const matchingItem = itemsRef.current[closest];
        if (matchingItem) {
          setSelectedPlaceId(matchingItem.place_id);
          setMapFocusTarget("selected");
          setFocusNonce((prev) => prev + 1);
        }
      }, 80);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      track.removeEventListener("scroll", onScroll);
    };
  }, [isMobileViewport, items]);

  const applyRecommendations = useCallback((recommendations: RecommendationItem[], preferredPlaceId?: string | null) => {
    const top3 = recommendations.slice(0, 3);
    const defaultSelected = top3[0]?.place_id ?? null;
    const selectedId =
      preferredPlaceId && top3.some((item) => item.place_id === preferredPlaceId) ? preferredPlaceId : defaultSelected;

    setItems(top3);
    setSelectedPlaceId(selectedId);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    return { top3, selectedId };
  }, []);

  const loadResults = async (options?: { forceRefresh?: boolean }) => {
    const flow = loadFlowState();
    const resolvedCountry = resolveFlowCountryCode(flow);

    if (!flow.position) {
      router.replace(toLocale("/status?kind=need_location"));
      return;
    }

    setOrigin(flow.position);
    setCountryCode(resolvedCountry);
    setFlowMode(flow.mode);
    setFlowRadius(flow.radius);
    setFlowRandomness(flow.randomness);
    const useKakao = HAS_KAKAO_KEY && resolvedCountry === "KR";
    setProvider(useKakao ? "kakao" : "osm");

    const flowKey = buildResultsFlowKey(flow);
    const forceRefresh = options?.forceRefresh ?? false;
    if (!forceRefresh && flowKey) {
      const cached = readResultsCache(flowKey);
      if (cached && cached.items.length > 0) {
        applyRecommendations(cached.items, cached.selectedPlaceId);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)] ?? t("common.loading"));

    try {
      const availability = await fetch(`/api/availability?country_code=${encodeURIComponent(resolvedCountry)}`).then(
        (r) => r.json() as Promise<AvailabilityResponse>,
      );

      if (!availability.supported) {
        router.replace(toLocale("/status?kind=unsupported"));
        return;
      }

      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: flow.position.lat,
          lng: flow.position.lng,
          mode: flow.mode,
          radius_m: flow.radius,
          randomness_level: flow.randomness,
          country_code: resolvedCountry,
          session_id: getSessionId(),
        }),
      });

      const data = (await response.json()) as RecommendationResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("failed");
      }

      if (data.status === "unsupported_region") {
        router.replace(toLocale("/status?kind=unsupported"));
        return;
      }
      if (data.status === "source_error") {
        router.replace(toLocale("/status?kind=error"));
        return;
      }
      if (data.recommendations.length === 0) {
        router.replace(toLocale("/status?kind=empty"));
        return;
      }

      const applied = applyRecommendations(data.recommendations);
      if (flowKey) {
        writeResultsCache(flowKey, applied.top3, applied.selectedId);
      }

      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_type: "impression",
          session_id: getSessionId(),
          mode: flow.mode,
          search_country: resolvedCountry,
        }),
      }).catch(() => {
        // Logging failure should not block showing recommendations.
      });
    } catch {
      router.replace(toLocale("/status?kind=error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 980px)");
    const onChange = () => setIsMobileViewport(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (!isMobileViewport || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [isMobileViewport]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)] ?? t("common.loading"));
    }, 2500);
    return () => clearInterval(interval);
  }, [loading, loadingMessages, t]);

  const reroll = () => {
    setSelectedPlaceId(null);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    setActiveCardIndex(0);
    setDetailOpen(false);
    void loadResults({ forceRefresh: true });
  };

  const openFilterEditor = () => {
    const flow = loadFlowState();
    setDraftMode(flow.mode);
    setDraftRadius(flow.radius);
    setDraftRandomness(flow.randomness);
    setLocationOpen(false);
    setFilterOpen(true);
  };

  const applyFilterChanges = () => {
    const flow = loadFlowState();
    saveFlowState({
      ...flow,
      mode: draftMode,
      radius: draftRadius,
      randomness: draftRandomness,
    });
    setFilterOpen(false);
    setSelectedPlaceId(null);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    setActiveCardIndex(0);
    setDetailOpen(false);
    void loadResults({ forceRefresh: true });
  };

  const openLocationEditor = () => {
    const flow = loadFlowState();
    const base = flow.position ?? origin;
    setLocationPreview(
      base
        ? {
            lat: base.lat,
            lng: base.lng,
            label: t("results.location.base"),
            countryCode: normalizeCountryCode(flow.countryCode),
          }
        : null,
    );
    setLocationQuery("");
    setLocationError(null);
    setFilterOpen(false);
    setLocationOpen(true);
  };

  const searchLocation = async () => {
    const q = locationQuery.trim();
    if (q.length < 2) {
      setLocationError(t("results.error.queryTooShort"));
      return;
    }

    const latLng = parseLatLng(q);
    if (latLng) {
      setLocationError(null);
      setLocationPreview({
        lat: latLng.lat,
        lng: latLng.lng,
        label: t("results.location.coordResult"),
        countryCode: undefined,
      });
      return;
    }

    setLocationLoading(true);
    setLocationError(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as GeocodeResponse;
      if (!response.ok || !data.ok || typeof data.lat !== "number" || typeof data.lng !== "number") {
        if (data.reason === "missing_api_key") {
          setLocationError(t("results.error.missingApi"));
        } else {
          setLocationError(t("results.error.notFound"));
        }
        return;
      }

      setLocationPreview({
        lat: data.lat,
        lng: data.lng,
        label: data.label ?? t("results.location.searchResult"),
        countryCode: normalizeCountryCode(data.country_code),
      });
    } catch {
      setLocationError(t("results.error.searchFailed"));
    } finally {
      setLocationLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(t("results.error.geolocationUnsupported"));
      return;
    }

    setGeolocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeolocationLoading(false);
        setLocationPreview({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: t("results.location.current"),
          countryCode: undefined,
        });
      },
      () => {
        setGeolocationLoading(false);
        setLocationError(t("results.error.geolocationFailed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  };

  const applyLocationChanges = async () => {
    if (!locationPreview) {
      setLocationError(t("results.error.locationPreviewRequired"));
      return;
    }

    let nextCountry = locationPreview.countryCode;
    if (!nextCountry) {
      try {
        const res = await fetch(`/api/geocode?lat=${locationPreview.lat}&lng=${locationPreview.lng}`);
        const data = (await res.json()) as GeocodeResponse;
        if (data.ok && data.country_code) {
          nextCountry = normalizeCountryCode(data.country_code);
        }
      } catch {
        // reverse geocode failed — fall through to inferSearchCountry
      }
    }
    if (!nextCountry) {
      nextCountry = inferSearchCountry(locationPreview.lat, locationPreview.lng);
    }

    const flow = loadFlowState();
    saveFlowState({
      ...flow,
      position: { lat: locationPreview.lat, lng: locationPreview.lng },
      countryCode: nextCountry,
    });
    setLocationOpen(false);
    setSelectedPlaceId(null);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    setActiveCardIndex(0);
    setDetailOpen(false);
    void loadResults({ forceRefresh: true });
  };

  const selectPlace = useCallback((placeId: string) => {
    setSelectedPlaceId(placeId);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);

    // Sync activeCardIndex + scroll swipe track
    const idx = itemsRef.current.findIndex((item) => item.place_id === placeId);
    if (idx >= 0) {
      setActiveCardIndex(idx);
      const track = swipeTrackRef.current;
      if (track) {
        const card = track.children[idx] as HTMLElement | undefined;
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    }

    const flowKey = buildResultsFlowKey(loadFlowState());
    if (flowKey && itemsRef.current.length > 0) {
      writeResultsCache(flowKey, itemsRef.current, placeId);
    }
  }, []);

  const handleKakaoLoadFail = useCallback(() => setProvider("osm"), []);

  const focusOrigin = () => {
    setMapFocusTarget("origin");
    setFocusNonce((prev) => prev + 1);
  };

  const detailItem = detailOpen ? (items[activeCardIndex] ?? null) : null;

  return (
    <main className="flow-page results">
      <FlowHeader />

      <section className="result-layout section-shell">
        <article className="map-panel">
          {origin ? (
            <div className="result-map-wrap">
              <div className="result-map-canvas">
                {provider === "kakao" ? (
                  <KakaoMap
                    origin={origin}
                    items={items}
                    selectedPlaceId={selected?.place_id ?? null}
                    mapFocusTarget={mapFocusTarget}
                    focusNonce={focusNonce}
                    mobileBottomOffset={isMobileViewport ? MOBILE_CARD_AREA_HEIGHT : 0}
                    locale={locale}
                    onSelect={selectPlace}
                    onLoadFail={handleKakaoLoadFail}
                  />
                ) : (
                  <InteractiveMap
                    origin={origin}
                    items={items}
                    selectedPlaceId={selected?.place_id ?? null}
                    mapFocusTarget={mapFocusTarget}
                    focusNonce={focusNonce}
                    mobileBottomOffset={isMobileViewport ? MOBILE_CARD_AREA_HEIGHT : 0}
                    locale={locale}
                    onSelect={selectPlace}
                  />
                )}
                <button
                  type="button"
                  className="map-origin-btn"
                  onClick={focusOrigin}
                  aria-label={t("results.mapFocusOriginAria")}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="4" fill="#f48c25" />
                    <line x1="10" y1="0" x2="10" y2="6" stroke="#f6efe7" strokeWidth="2" strokeLinecap="round" />
                    <line x1="10" y1="14" x2="10" y2="20" stroke="#f6efe7" strokeWidth="2" strokeLinecap="round" />
                    <line x1="0" y1="10" x2="6" y2="10" stroke="#f6efe7" strokeWidth="2" strokeLinecap="round" />
                    <line x1="14" y1="10" x2="20" y2="10" stroke="#f6efe7" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <p className="muted">
                {provider === "kakao"
                  ? t("results.mapHintKakao")
                  : t("results.mapHintOsm")}
              </p>
            </div>
          ) : (
            <div className="map-empty">{t("results.mapLoading")}</div>
          )}
        </article>

        {/* Desktop: floating panel */}
        {!isMobileViewport && (
          <article className="desktop-float-panel">
            <div className="desktop-panel-header">
              <div>
                <h2>{t("results.topPicks")}</h2>
                <p className="result-subtitle">{modeLabel} · {radiusLabel} · {vibeLabel}</p>
              </div>
              <div className="desktop-panel-actions">
                <button className="result-action-btn secondary" onClick={openLocationEditor}>
                  {t("results.actionChangeLocation")}
                </button>
                <button className="result-action-btn secondary" onClick={openFilterEditor}>
                  {t("results.actionChangeFilters")}
                </button>
                <button className="result-action-btn primary" onClick={reroll} disabled={loading}>
                  {loading ? t("common.loading") : t("results.actionReroll")}
                </button>
              </div>
            </div>
            <div className="desktop-cards-list">
              {items.map((item, idx) => (
                <article
                  key={item.place_id}
                  className={`result-card ${selected?.place_id === item.place_id ? "active" : ""}`}
                  onClick={() => selectPlace(item.place_id)}
                >
                  <div className="title-row">
                    <h3>
                      {item.name}
                      <small>{item.address || t("results.cardNoAddress")}</small>
                    </h3>
                    <span className="chip-rank">{t("results.cardMatch", { rank: idx + 1 })}</span>
                  </div>
                  <div className="result-tags">
                    <p className="meta">{formatDistance(item.distance_m, locale)}</p>
                    <p className="meta">{"₩".repeat(item.price_level) || t("results.priceFallback")}</p>
                    {item.rating != null && <p className="meta">★{item.rating}</p>}
                  </div>
                  <p className="reason"><span className="category-chip">{item.raw_category || item.category || t("results.cardFallbackCategory")}</span></p>
                  <p className="reason">{item.why.map((reason) => localizeReason(reason, t)).join(" · ") || t("results.cardReasonPending")}</p>
                  <div className="btn-row">
                    {useKrLinks ? (
                      <>
                        {kakaoPlaceIdMapLink(item) ? (
                          <a className="btn-link" href={kakaoPlaceIdMapLink(item) ?? "#"} target="_blank" rel="noreferrer">{t("results.linkKakaoLong")}</a>
                        ) : null}
                        <a className="btn-ghost" href={naverSearchLink(item)} target="_blank" rel="noreferrer">{t("results.linkNaverLong")}</a>
                      </>
                    ) : (
                      <a className="btn-link" href={googlePlaceLink(item)} target="_blank" rel="noreferrer">{t("results.linkGoogleLong")}</a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </article>
        )}

        {/* Mobile: floating action buttons */}
        {isMobileViewport && (
          <div className="mobile-float-actions">
            <button className="result-action-btn secondary" onClick={openLocationEditor}>
              {t("results.actionChangeLocation")}
            </button>
            <button className="result-action-btn secondary" onClick={openFilterEditor}>
              {t("results.actionChangeFilters")}
            </button>
            <button className="result-action-btn primary" onClick={reroll} disabled={loading}>
              {loading ? t("common.loading") : t("results.actionReroll")}
            </button>
          </div>
        )}

        {/* Mobile: swipe card area */}
        {isMobileViewport && (
          <div className="swipe-card-container">
            <div className="swipe-track" ref={swipeTrackRef}>
              {items.map((item, idx) => (
                <div
                  key={item.place_id}
                  className={`swipe-card ${activeCardIndex === idx ? "active" : ""}`}
                  onClick={() => setDetailOpen(true)}
                >
                  <span className="swipe-card-rank">{idx + 1}</span>
                  <div className="swipe-card-info">
                    <strong>{item.name}</strong>
                    <span>
                      {(item.raw_category || item.category || t("results.cardFallbackCategory")) +
                        " · " +
                        formatDistance(item.distance_m, locale) +
                        (item.rating != null ? " · ★" + item.rating : "")}
                    </span>
                  </div>
                  <span className="swipe-card-chevron" aria-hidden="true">›</span>
                </div>
              ))}
            </div>
            <div className="swipe-dots">
              {items.map((_, idx) => (
                <span
                  key={idx}
                  className={`swipe-dot ${activeCardIndex === idx ? "active" : ""}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Mobile: detail overlay */}
        {isMobileViewport && detailOpen && detailItem && (
          <div className="detail-overlay-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDetailOpen(false); }}>
            <div className="detail-overlay">
              <div className="detail-overlay-content">
                <div className="title-row">
                  <h3>
                    {detailItem.name}
                    <small>{detailItem.address || t("results.cardNoAddress")}</small>
                  </h3>
                  <span className="chip-rank">{t("results.cardMatch", { rank: activeCardIndex + 1 })}</span>
                </div>
                <div className="result-tags">
                  <p className="meta">{formatDistance(detailItem.distance_m, locale)}</p>
                  <p className="meta">{"₩".repeat(detailItem.price_level) || t("results.priceFallback")}</p>
                  {detailItem.rating != null && <p className="meta">★{detailItem.rating}</p>}
                </div>
                <p className="reason"><span className="category-chip">{detailItem.raw_category || detailItem.category || t("results.cardFallbackCategory")}</span></p>
                <p className="reason">{detailItem.why.map((reason) => localizeReason(reason, t)).join(" · ") || t("results.cardReasonPending")}</p>
                <div className="btn-row">
                  {useKrLinks ? (
                    <>
                      {kakaoPlaceIdMapLink(detailItem) ? (
                        <a className="btn-link" href={kakaoPlaceIdMapLink(detailItem) ?? "#"} target="_blank" rel="noreferrer">{t("results.linkKakaoLong")}</a>
                      ) : null}
                      <a className="btn-ghost" href={naverSearchLink(detailItem)} target="_blank" rel="noreferrer">{t("results.linkNaverLong")}</a>
                    </>
                  ) : (
                    <a className="btn-link" href={googlePlaceLink(detailItem)} target="_blank" rel="noreferrer">{t("results.linkGoogleLong")}</a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {filterOpen ? (
        <div className="result-editor-backdrop" onClick={(e) => e.target === e.currentTarget && setFilterOpen(false)}>
          <section className="result-editor-sheet" role="dialog" aria-modal="true" aria-label={t("results.editor.filterTitle")}>
            <header className="result-editor-head">
              <h2>{t("results.editor.filterTitle")}</h2>
              <button type="button" className="btn-ghost" onClick={() => setFilterOpen(false)}>{t("common.close")}</button>
            </header>

            <div className="result-editor-body">
              <article className="result-editor-card">
                <h3>{t("results.editor.mealTitle")}</h3>
                <div className="result-editor-meal-grid">
                  <button type="button" className={draftMode === "lunch" ? "active" : ""} onClick={() => setDraftMode("lunch")}>
                    {t("mode.lunch")}
                  </button>
                  <button type="button" className={draftMode === "dinner" ? "active" : ""} onClick={() => setDraftMode("dinner")}>
                    {t("mode.dinner")}
                  </button>
                </div>
              </article>

              <article className="result-editor-card">
                <div className="result-editor-row">
                  <h3>{t("results.editor.radiusTitle")}</h3>
                  <strong>{t("results.editor.radiusWithin", { radius: formatRadius(draftRadius, locale) })}</strong>
                </div>
                <div className="pref-radius-wrap">
                  <div className="pref-radius-track">
                    <span className="pref-radius-fill" style={{ width: `${((draftRadius - 100) / (3000 - 100)) * 100}%` }} />
                    <input
                      type="range"
                      min={100}
                      max={3000}
                      step={100}
                      value={draftRadius}
                      onChange={(e) => setDraftRadius(Number(e.target.value))}
                      aria-label={t("results.editor.radiusTitle")}
                    />
                  </div>
                  <div className="pref-radius-scale">
                    <span>100m</span>
                    <span>1km</span>
                    <span>3km</span>
                  </div>
                  <div className="pref-radius-presets">
                    {[500, 1000, 2000, 3000].map((value) => (
                      <button key={value} type="button" className={draftRadius === value ? "active" : ""} onClick={() => setDraftRadius(value)}>
                        {formatRadius(value, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <article className="result-editor-card">
                <h3>{t("results.editor.vibeTitle")}</h3>
                <div className="result-editor-vibe-grid">
                  {VIBE_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={draftRandomness === option.value ? "active" : ""}
                      onClick={() => setDraftRandomness(option.value)}
                    >
                      <strong>{t(option.titleKey)}</strong>
                      <span>{t(option.descKey)}</span>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <footer className="result-editor-actions">
              <button type="button" className="btn-ghost" onClick={() => setFilterOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-primary" onClick={applyFilterChanges}>{t("results.editor.apply")}</button>
            </footer>
          </section>
        </div>
      ) : null}

      {locationOpen ? (
        <div className="result-editor-backdrop" onClick={(e) => e.target === e.currentTarget && setLocationOpen(false)}>
          <section className="result-editor-sheet" role="dialog" aria-modal="true" aria-label={t("results.editor.locationTitle")}>
            <header className="result-editor-head">
              <h2>{t("results.editor.locationTitle")}</h2>
              <button type="button" className="btn-ghost" onClick={() => setLocationOpen(false)}>{t("common.close")}</button>
            </header>

            <div className="result-editor-body">
              <article className="result-editor-card">
                <h3>{t("results.editor.searchTitle")}</h3>
                <div className="result-editor-search">
                  <input
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder={t("results.editor.searchPlaceholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchLocation();
                      }
                    }}
                  />
                  <button type="button" className="btn-ghost" onClick={searchLocation} disabled={locationLoading || geolocationLoading}>
                    {locationLoading ? t("common.searching") : t("common.search")}
                  </button>
                  <button type="button" className="btn-ghost" onClick={useCurrentLocation} disabled={locationLoading || geolocationLoading}>
                    {geolocationLoading ? t("common.checking") : t("common.currentLocation")}
                  </button>
                </div>
              </article>

              <article className="result-editor-card">
                <h3>{t("results.editor.mapPickTitle")}</h3>
                {locationPreview ? (
                  <>
                    <LocationPicker
                      value={{ lat: locationPreview.lat, lng: locationPreview.lng }}
                      onChange={(next) =>
                        setLocationPreview({
                          lat: next.lat,
                          lng: next.lng,
                          label: t("results.location.pickedOnMap"),
                          countryCode: undefined,
                        })
                      }
                    />
                    <p className="result-editor-help">
                      {locationPreview.label ?? t("results.location.pickedOnMap")} · {locationPreview.lat.toFixed(5)}, {locationPreview.lng.toFixed(5)}
                    </p>
                  </>
                ) : (
                  <p className="result-editor-help">{t("results.editor.mapPickEmpty")}</p>
                )}
              </article>
              {locationError ? <p className="error-text">{locationError}</p> : null}
            </div>

            <footer className="result-editor-actions">
              <button type="button" className="btn-ghost" onClick={() => setLocationOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-primary" onClick={applyLocationChanges} disabled={!locationPreview}>
                {t("results.editor.researchWithLocation")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {loading && (
        <div className="loading-overlay" aria-live="polite" role="status">
          <div className="loading-card">
            <div className="loading-emoji" aria-hidden="true">🍽️</div>
            <div className="loading-progress">
              <div className="loading-progress-bar" />
            </div>
            <p className="loading-text">{loadingMessage}</p>
          </div>
        </div>
      )}
    </main>
  );
}
