"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { getSessionId, loadFlowState, saveFlowState } from "@/lib/flow/state";
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
type SheetSnap = "collapsed" | "half" | "expanded";
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

function inferSearchCountry(lat: number, lng: number): string {
  const isKorea = lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132;
  return isKorea ? "KR" : "US";
}

function normalizeCountryCode(input?: string | null): string | undefined {
  if (!input) return undefined;
  const code = input.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const match = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function rubberBand(offset: number, dimension: number): number {
  const c = 0.55;
  const abs = Math.abs(offset);
  const result = (abs * dimension * c) / (dimension + c * abs);
  return offset < 0 ? -result : result;
}

function getSafeAreaBottom(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const val = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return val;
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
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("collapsed");
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 980px)").matches : false,
  );
  const dragStartYRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const dragStartInStickyRef = useRef(false);
  const suppressCardClickUntilRef = useRef(0);
  const mobileCardsListRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const snapPointsRef = useRef({ collapsed: 0, half: 0, expanded: 0 });
  const mapButtonMetricsRef = useRef({ safeBottom: 0, maxHeight: 0 });
  const mapOriginBtnRef = useRef<HTMLButtonElement | null>(null);
  const currentTranslateYRef = useRef(0);
  const dragStartTranslateYRef = useRef(0);
  const lastPointerYRef = useRef(0);
  const lastPointerTimeRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const loadingMessages = useMemo(() => LOADING_MESSAGE_KEYS.map((key) => t(key)), [t]);
  const useKrLinks = countryCode === "KR";
  const modeLabel = flowMode === "dinner" ? t("mode.dinnerTag") : t("mode.lunchTag");
  const radiusLabel = formatRadius(flowRadius, locale);
  const vibeLabel = t(VIBE_OPTIONS.find((v) => v.value === flowRandomness)?.titleKey ?? "results.vibe.balanced");

  const selected = useMemo(() => {
    if (!selectedPlaceId) return items[0] ?? null;
    return items.find((item) => item.place_id === selectedPlaceId) ?? items[0] ?? null;
  }, [items, selectedPlaceId]);

  const loadResults = async () => {
    const flow = loadFlowState();

    if (!flow.position) {
      router.replace(toLocale("/status?kind=need_location"));
      return;
    }

    setOrigin(flow.position);
    setCountryCode(flow.countryCode ?? null);
    setFlowMode(flow.mode);
    setFlowRadius(flow.radius);
    setFlowRandomness(flow.randomness);
    const useKakao = HAS_KAKAO_KEY && flow.countryCode === "KR";
    setProvider(useKakao ? "kakao" : "osm");
    setLoading(true);
    setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)] ?? t("common.loading"));

    try {
      const availability = await fetch(`/api/availability?country_code=${flow.countryCode}`).then(
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
          country_code: flow.countryCode,
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

      const top3 = data.recommendations.slice(0, 3);
      setItems(top3);
      setSelectedPlaceId(top3[0]?.place_id ?? null);
      setMapFocusTarget("selected");
      setFocusNonce((prev) => prev + 1);

      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_type: "impression",
          session_id: getSessionId(),
          mode: flow.mode,
          search_country: flow.countryCode,
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
    loadResults();
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

  const computeSnapPoints = useCallback(() => {
    const vh = window.innerHeight;
    const maxH = vh - 48;
    const safeBottom = getSafeAreaBottom();
    mapButtonMetricsRef.current = { safeBottom, maxHeight: maxH };
    snapPointsRef.current = {
      expanded: 0,
      half: Math.max(0, maxH - 372 - safeBottom),
      collapsed: Math.max(0, maxH - 176 - safeBottom),
    };
  }, []);

  const mapOriginBottomForY = useCallback((y: number): number => {
    const { expanded, half, collapsed } = snapPointsRef.current;
    const { safeBottom } = mapButtonMetricsRef.current;
    const low = 186 + safeBottom;
    const high = 382 + safeBottom;

    if (y <= half) {
      const range = Math.max(1, half - expanded);
      const t = (half - y) / range;
      return high - (high - low) * t;
    }

    const range = Math.max(1, collapsed - half);
    const t = (y - half) / range;
    return high - (high - low) * t;
  }, []);

  const syncMapOriginButton = useCallback(
    (sheetY: number) => {
      const btn = mapOriginBtnRef.current;
      if (!btn) return;
      if (!isMobileViewport) {
        btn.style.bottom = "";
        return;
      }
      btn.style.bottom = `${Math.round(mapOriginBottomForY(sheetY))}px`;
    },
    [isMobileViewport, mapOriginBottomForY],
  );

  const resolveSnapTarget = useCallback((currentY: number, velocity: number): SheetSnap => {
    const { expanded, half, collapsed } = snapPointsRef.current;
    const FLICK = 0.5;
    if (Math.abs(velocity) > FLICK) {
      if (velocity > 0) return currentY < half ? "half" : "collapsed";
      return currentY > half ? "half" : "expanded";
    }
    const dE = Math.abs(currentY - expanded);
    const dH = Math.abs(currentY - half);
    const dC = Math.abs(currentY - collapsed);
    if (dE <= dH && dE <= dC) return "expanded";
    if (dH <= dC) return "half";
    return "collapsed";
  }, []);

  const settleToSnap = useCallback((snap: SheetSnap) => {
    const el = sheetRef.current;
    if (!el) return;
    const y = snapPointsRef.current[snap];
    currentTranslateYRef.current = y;
    el.classList.remove("dragging");
    el.style.transform = `translateY(${y}px)`;
    syncMapOriginButton(y);
    setSheetSnap(snap);
  }, [syncMapOriginButton]);

  useEffect(() => {
    if (!isMobileViewport) {
      const el = sheetRef.current;
      if (el) {
        el.style.transform = "";
        el.classList.remove("dragging");
      }
      syncMapOriginButton(0);
      return;
    }
    computeSnapPoints();
    const el = sheetRef.current;
    if (el) {
      const y = snapPointsRef.current[sheetSnap];
      currentTranslateYRef.current = y;
      el.style.transform = `translateY(${y}px)`;
      syncMapOriginButton(y);
    }
    const onResize = () => {
      computeSnapPoints();
      const resizeEl = sheetRef.current;
      if (!resizeEl) return;
      const y = snapPointsRef.current[sheetSnap];
      currentTranslateYRef.current = y;
      resizeEl.classList.add("dragging");
      resizeEl.style.transform = `translateY(${y}px)`;
      syncMapOriginButton(y);
      requestAnimationFrame(() => sheetRef.current?.classList.remove("dragging"));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobileViewport, sheetSnap, computeSnapPoints, syncMapOriginButton]);

  const reroll = () => {
    setSelectedPlaceId(null);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    loadResults();
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
    loadResults();
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
    loadResults();
  };

  const beginSheetDrag = (
    e: ReactPointerEvent<HTMLElement>,
    opts: { force?: boolean } = {},
  ) => {
    if (!isMobileViewport) return;
    const targetEl = e.target as HTMLElement | null;
    const interactiveAncestor = targetEl?.closest("a, button, input, textarea, select");
    if (!opts.force && interactiveAncestor) return;
    const isInSticky = Boolean(targetEl?.closest(".mobile-sheet-sticky"));

    const panel = sheetRef.current ?? (e.currentTarget as HTMLElement);
    if (!opts.force && sheetSnap === "expanded" && panel.scrollTop > 2) return;
    const list = mobileCardsListRef.current;
    if (!opts.force && sheetSnap === "expanded" && list && list.scrollTop > 2) return;
    dragStartInStickyRef.current = opts.force || isInSticky;

    dragStartYRef.current = e.clientY;
    dragMovedRef.current = false;
    dragStartTranslateYRef.current = currentTranslateYRef.current;
    lastPointerYRef.current = e.clientY;
    lastPointerTimeRef.current = e.timeStamp;
    dragVelocityRef.current = 0;
  };

  const endSheetDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartYRef.current === null) return;

    const moved = dragMovedRef.current;
    if (moved) {
      const target = resolveSnapTarget(currentTranslateYRef.current, dragVelocityRef.current);
      settleToSnap(target);
      suppressCardClickUntilRef.current = Date.now() + 240;
    } else if (dragStartInStickyRef.current) {
      const next: SheetSnap =
        sheetSnap === "collapsed" ? "half" : sheetSnap === "half" ? "expanded" : "half";
      settleToSnap(next);
    }

    dragStartYRef.current = null;
    dragMovedRef.current = false;
    dragStartInStickyRef.current = false;
    const panel = e.currentTarget as HTMLElement;
    if (moved && panel.hasPointerCapture(e.pointerId)) {
      panel.releasePointerCapture(e.pointerId);
    }
  };

  const cancelSheetDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartYRef.current === null) return;
    settleToSnap(sheetSnap);
    dragStartYRef.current = null;
    dragMovedRef.current = false;
    dragStartInStickyRef.current = false;
    const panel = e.currentTarget as HTMLElement;
    if (panel.hasPointerCapture(e.pointerId)) {
      panel.releasePointerCapture(e.pointerId);
    }
  };

  const onSheetPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    beginSheetDrag(e);
  };

  const onSheetPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartYRef.current === null) return;
    const delta = e.clientY - dragStartYRef.current;
    if (!dragMovedRef.current && Math.abs(delta) > 6) {
      dragMovedRef.current = true;
      const el = sheetRef.current;
      if (el) el.classList.add("dragging");
      const panel = e.currentTarget as HTMLElement;
      if (!panel.hasPointerCapture(e.pointerId)) {
        panel.setPointerCapture(e.pointerId);
      }
    }
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();

      const now = e.timeStamp;
      const dt = now - lastPointerTimeRef.current;
      if (dt > 0) {
        dragVelocityRef.current = (e.clientY - lastPointerYRef.current) / dt;
      }
      lastPointerYRef.current = e.clientY;
      lastPointerTimeRef.current = now;

      let newY = dragStartTranslateYRef.current + delta;
      const { expanded, collapsed } = snapPointsRef.current;
      if (newY < expanded) {
        newY = expanded + rubberBand(newY - expanded, window.innerHeight);
      } else if (newY > collapsed) {
        newY = collapsed + rubberBand(newY - collapsed, window.innerHeight);
      }

      const el = sheetRef.current;
      if (el) {
        el.style.transform = `translateY(${newY}px)`;
        currentTranslateYRef.current = newY;
        syncMapOriginButton(newY);
      }
    }
  };

  const onSheetPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    endSheetDrag(e);
  };

  const onSheetPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    cancelSheetDrag(e);
  };

  const onGrabberPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    beginSheetDrag(e, { force: true });
  };

  const onGrabberPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    onSheetPointerMove(e);
  };

  const onGrabberPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    onSheetPointerUp(e);
  };

  const onGrabberPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    onSheetPointerCancel(e);
  };

  const selectPlace = useCallback((placeId: string) => {
    if (Date.now() < suppressCardClickUntilRef.current) return;
    setSelectedPlaceId(placeId);
    setMapFocusTarget("selected");
    setFocusNonce((prev) => prev + 1);
    setSheetSnap((prev) => (prev === "expanded" ? "half" : prev));
  }, []);

  const handleKakaoLoadFail = useCallback(() => setProvider("osm"), []);

  const focusOrigin = () => {
    setMapFocusTarget("origin");
    setFocusNonce((prev) => prev + 1);
  };

  const compactMobileCards = isMobileViewport && sheetSnap === "half";
  const expandedFitCards = isMobileViewport && sheetSnap === "expanded";
  const showMobileCards = !isMobileViewport || sheetSnap !== "collapsed";

  return (
    <main className={`flow-page results results-sheet-${sheetSnap}`}>
      <FlowHeader />

      <header className="result-top section-shell">
        <div className="result-heading">
          <h1>{t("results.topPicks")}</h1>
          <p className="result-subtitle">
            {modeLabel} · {radiusLabel} · {vibeLabel}
          </p>
        </div>
        <div className="result-actions-top">
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
      </header>

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
                    sheetSnap={sheetSnap}
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
                    sheetSnap={sheetSnap}
                    locale={locale}
                    onSelect={selectPlace}
                  />
                )}
                <button
                  ref={mapOriginBtnRef}
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

        <article
          ref={sheetRef}
          className={`cards-panel mobile-sheet sheet-${sheetSnap}`}
          onPointerDown={isMobileViewport ? onSheetPointerDown : undefined}
          onPointerMove={isMobileViewport ? onSheetPointerMove : undefined}
          onPointerUp={isMobileViewport ? onSheetPointerUp : undefined}
          onPointerCancel={isMobileViewport ? onSheetPointerCancel : undefined}
        >
          <div className="mobile-sheet-sticky">
            <button
              type="button"
              className="sheet-grabber"
              onPointerDown={onGrabberPointerDown}
              onPointerMove={onGrabberPointerMove}
              onPointerUp={onGrabberPointerUp}
              onPointerCancel={onGrabberPointerCancel}
              aria-label={t("results.sheetGrabberAria")}
            />
            <div className="mobile-sheet-head">
              <h2>{t("results.topPicks")}</h2>
              <p>{modeLabel} · {radiusLabel} · {vibeLabel}</p>
              <div className="mobile-sheet-actions">
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
          </div>
          {showMobileCards ? (
            <div
              ref={mobileCardsListRef}
              className={`mobile-cards-list ${compactMobileCards ? "compact" : expandedFitCards ? "expanded-fit" : "full"}`}
            >
              {items.map((item, idx) => (
                <article
                  key={item.place_id}
                  className={`result-card ${compactMobileCards ? "compact" : ""} ${expandedFitCards ? "expanded-fit" : ""} ${selected?.place_id === item.place_id ? "active" : ""}`}
                  onClick={() => selectPlace(item.place_id)}
                >
                  <div className="title-row">
                    <h3>
                      {item.name}
                      {compactMobileCards ? null : <small>{item.address || t("results.cardNoAddress")}</small>}
                    </h3>
                    <span className="chip-rank">{t("results.cardMatch", { rank: idx + 1 })}</span>
                  </div>

                  {compactMobileCards ? (
                    <div className="result-tags compact-tags">
                      <p className="meta">{item.raw_category || item.category || t("results.cardFallbackCategory")}</p>
                      <p className="meta">{formatDistance(item.distance_m, locale)}</p>
                      <p className="meta">★{item.rating}</p>
                    </div>
                  ) : expandedFitCards ? (
                    <>
                      <p className="expanded-meta-line">
                        {(item.raw_category || item.category || t("results.cardFallbackCategory")) +
                          " · " +
                          formatDistance(item.distance_m, locale) +
                          " · ★" +
                          item.rating}
                      </p>
                      <p className="reason">{item.why.map((reason) => localizeReason(reason, t)).join(" · ") || t("results.cardReasonPending")}</p>
                      <div className="btn-row expanded-fit-btn-row">
                        {useKrLinks ? (
                          <>
                            {kakaoPlaceIdMapLink(item) ? (
                              <a className="btn-link" href={kakaoPlaceIdMapLink(item) ?? "#"} target="_blank" rel="noreferrer">{t("results.linkKakao")}</a>
                            ) : null}
                            <a className="btn-ghost" href={naverSearchLink(item)} target="_blank" rel="noreferrer">{t("results.linkNaver")}</a>
                          </>
                        ) : (
                          <a className="btn-link" href={googlePlaceLink(item)} target="_blank" rel="noreferrer">{t("results.linkMap")}</a>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="result-tags">
                        <p className="meta">{formatDistance(item.distance_m, locale)}</p>
                        <p className="meta">{"₩".repeat(item.price_level) || t("results.priceFallback")}</p>
                        <p className="meta">★{item.rating}</p>
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
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </article>
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
