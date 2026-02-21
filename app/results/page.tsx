"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { getSessionId, loadFlowState, saveFlowState } from "@/lib/flow/state";
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
const VIBE_OPTIONS: Array<{ value: RandomnessLevel; title: string; desc: string }> = [
  { value: "stable", title: "안전빵", desc: "검증된 맛집 중심" },
  { value: "balanced", title: "요즘 핫한", desc: "인기+랜덤 균형" },
  { value: "explore", title: "모험가", desc: "숨은 로컬 탐색" },
];

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

function localizeReason(reason: string): string {
  const table: Record<string, string> = {
    "Near your location": "내 위치 근처",
    "Fits your time-of-day preference": "선택한 시간대와 잘 맞아요",
    "Open now": "영업중",
    "Highly rated": "평점이 높아요",
    "Popular now": "요즘 인기 많은 곳",
    "Hidden gem pick": "숨은 보석 같은 곳",
  };
  return table[reason] ?? reason;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(distanceMeters % 1000 === 0 ? 0 : 1)}km`;
  }
  return `${distanceMeters}m`;
}

function formatRadius(radiusMeters: number): string {
  if (radiusMeters >= 1000) {
    return `${(radiusMeters / 1000).toFixed(radiusMeters % 1000 === 0 ? 0 : 1)}km`;
  }
  return `${radiusMeters}m`;
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

export default function ResultsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget>("selected");
  const [loading, setLoading] = useState(true);
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
  const [sheetDragging, setSheetDragging] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 980px)").matches : false,
  );
  const dragStartYRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const dragStartInStickyRef = useRef(false);
  const suppressCardClickUntilRef = useRef(0);
  const useKrLinks = countryCode === "KR";
  const modeLabel = flowMode === "dinner" ? "저메추" : "점메추";
  const radiusLabel = formatRadius(flowRadius);
  const vibeLabel = VIBE_OPTIONS.find((v) => v.value === flowRandomness)?.title ?? "요즘 핫한";

  const selected = useMemo(() => {
    if (!selectedPlaceId) return items[0] ?? null;
    return items.find((item) => item.place_id === selectedPlaceId) ?? items[0] ?? null;
  }, [items, selectedPlaceId]);

  const loadResults = async () => {
    const flow = loadFlowState();

    if (!flow.position) {
      router.replace("/status?kind=need_location");
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

    try {
      const availability = await fetch(`/api/availability?country_code=${flow.countryCode}`).then(
        (r) => r.json() as Promise<AvailabilityResponse>,
      );

      if (!availability.supported) {
        router.replace("/status?kind=unsupported");
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
        router.replace("/status?kind=unsupported");
        return;
      }
      if (data.status === "source_error") {
        router.replace("/status?kind=error");
        return;
      }
      if (data.recommendations.length === 0) {
        router.replace("/status?kind=empty");
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
      router.replace("/status?kind=error");
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
            label: "현재 검색 기준 위치",
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
      setLocationError("주소, 도시명, 또는 좌표를 입력해 주세요.");
      return;
    }

    const latLng = parseLatLng(q);
    if (latLng) {
      setLocationError(null);
      setLocationPreview({
        lat: latLng.lat,
        lng: latLng.lng,
        label: "좌표 검색 결과",
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
          setLocationError("Google Maps API 키가 없어 텍스트 검색이 제한됩니다.");
        } else {
          setLocationError("위치를 찾지 못했어요. 다른 키워드로 시도해 주세요.");
        }
        return;
      }

      setLocationPreview({
        lat: data.lat,
        lng: data.lng,
        label: data.label ?? "검색 결과 위치",
        countryCode: normalizeCountryCode(data.country_code),
      });
    } catch {
      setLocationError("위치 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLocationLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("브라우저에서 위치 기능을 지원하지 않아요.");
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
          label: "현재 위치",
          countryCode: undefined,
        });
      },
      () => {
        setGeolocationLoading(false);
        setLocationError("현재 위치를 가져오지 못했어요. 권한을 확인해 주세요.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  };

  const applyLocationChanges = async () => {
    if (!locationPreview) {
      setLocationError("지도로 위치를 찍거나 검색으로 위치를 선택해 주세요.");
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

  const snapIndex = (snap: SheetSnap) => {
    if (snap === "collapsed") return 0;
    if (snap === "half") return 1;
    return 2;
  };

  const snapFromIndex = (index: number): SheetSnap => {
    const safe = Math.max(0, Math.min(2, index));
    if (safe <= 0) return "collapsed";
    if (safe === 1) return "half";
    return "expanded";
  };

  const beginSheetDrag = (
    e: ReactPointerEvent<HTMLElement>,
    opts: {
      force?: boolean;
    } = {},
  ) => {
    if (!isMobileViewport) return;
    const targetEl = e.target as HTMLElement | null;
    const tag = targetEl?.tagName?.toLowerCase() ?? "";
    if (!opts.force && ["a","button","input","textarea","select"].includes(tag)) return;

    const panel = e.currentTarget as HTMLElement;
    if (!opts.force && sheetSnap === "expanded" && panel.scrollTop > 2) return;
    dragStartInStickyRef.current = opts.force || Boolean(targetEl?.closest(".mobile-sheet-sticky"));

    dragStartYRef.current = e.clientY;
    dragMovedRef.current = false;
    setSheetDragging(false);
  };

  const endSheetDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartYRef.current === null) return;

    const delta = e.clientY - dragStartYRef.current;
    const moved = dragMovedRef.current;
    if (moved) {
      if (delta > 40) shiftSnap(-1);
      if (delta < -40) shiftSnap(1);
      suppressCardClickUntilRef.current = Date.now() + 240;
    } else if (dragStartInStickyRef.current) {
      setSheetSnap((prev) => {
        if (prev === "collapsed") return "half";
        if (prev === "half") return "expanded";
        return "half";
      });
    }

    dragStartYRef.current = null;
    dragMovedRef.current = false;
    dragStartInStickyRef.current = false;
    setSheetDragging(false);
    const panel = e.currentTarget as HTMLElement;
    if (moved && panel.hasPointerCapture(e.pointerId)) {
      panel.releasePointerCapture(e.pointerId);
    }
  };

  const cancelSheetDrag = (e: ReactPointerEvent<HTMLElement>) => {
    dragStartYRef.current = null;
    dragMovedRef.current = false;
    dragStartInStickyRef.current = false;
    setSheetDragging(false);
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
      setSheetDragging(true);
      const panel = e.currentTarget as HTMLElement;
      if (!panel.hasPointerCapture(e.pointerId)) {
        panel.setPointerCapture(e.pointerId);
      }
    }
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
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

  const shiftSnap = (delta: -1 | 1) => {
    setSheetSnap((prev) => snapFromIndex(snapIndex(prev) + delta));
  };

  return (
    <main className={`flow-page results results-sheet-${sheetSnap}`}>
      <FlowHeader />

      <header className="result-top section-shell">
        <div className="result-heading">
          <h1>Top 3 Picks</h1>
          <p className="result-subtitle">
            {modeLabel} · {radiusLabel} · {vibeLabel}
          </p>
        </div>
        <div className="result-actions-top">
          <button className="result-action-btn secondary" onClick={openLocationEditor}>위치 변경</button>
          <button className="result-action-btn secondary" onClick={openFilterEditor}>조건 변경</button>
          <button className="result-action-btn primary" onClick={reroll} disabled={loading}>{loading ? "로딩..." : "다시뽑기"}</button>
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
                    onSelect={selectPlace}
                  />
                )}
                <button type="button" className="map-origin-btn" onClick={focusOrigin} aria-label="검색 기준 위치로 이동">
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
                  ? "한국에서는 Kakao Map으로 표시됩니다. M: 내 위치 · 주황 포인트: 추천 식당"
                  : "M: 내 위치 · 1~3: 추천 식당. 지도를 드래그/확대해 주변을 직접 탐색할 수 있어요."}
              </p>
            </div>
          ) : (
            <div className="map-empty">결과를 불러오는 중입니다.</div>
          )}
        </article>

        <article
          className={`cards-panel mobile-sheet sheet-${sheetSnap}${sheetDragging ? " dragging" : ""}`}
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
              aria-label="결과 패널 크기 조절"
            />
            <div className="mobile-sheet-head">
              <h2>Top 3 Picks</h2>
              <p>{modeLabel} · {radiusLabel} · {vibeLabel}</p>
              <div className="mobile-sheet-actions">
                <button className="result-action-btn secondary" onClick={openLocationEditor}>위치 변경</button>
                <button className="result-action-btn secondary" onClick={openFilterEditor}>조건 변경</button>
                <button className="result-action-btn primary" onClick={reroll} disabled={loading}>{loading ? "로딩..." : "다시뽑기"}</button>
              </div>
            </div>
          </div>
          {showMobileCards ? (
            <div className={`mobile-cards-list ${compactMobileCards ? "compact" : expandedFitCards ? "expanded-fit" : "full"}`}>
              {items.map((item, idx) => (
                <article
                  key={item.place_id}
                  className={`result-card ${compactMobileCards ? "compact" : ""} ${expandedFitCards ? "expanded-fit" : ""} ${selected?.place_id === item.place_id ? "active" : ""}`}
                  onClick={() => selectPlace(item.place_id)}
                >
                  <div className="title-row">
                    <h3>
                      {item.name}
                      {compactMobileCards ? null : <small>{item.address || "주소 정보 없음"}</small>}
                    </h3>
                    <span className="chip-rank">#{idx + 1} MATCH</span>
                  </div>

                  {compactMobileCards ? (
                    <div className="result-tags compact-tags">
                      <p className="meta">{item.raw_category || item.category || "기타"}</p>
                      <p className="meta">{formatDistance(item.distance_m)}</p>
                      <p className="meta">★{item.rating}</p>
                    </div>
                  ) : expandedFitCards ? (
                    <>
                      <div className="result-tags expanded-tags">
                        <p className="meta">{formatDistance(item.distance_m)}</p>
                        <p className="meta">{item.raw_category || item.category || "기타"}</p>
                        <p className="meta">★{item.rating}</p>
                      </div>
                      <p className="reason">{item.why.map(localizeReason).join(" · ") || "추천 이유 계산 중"}</p>
                      <div className="btn-row expanded-fit-btn-row">
                        {useKrLinks ? (
                          <>
                            {kakaoPlaceIdMapLink(item) ? (
                              <a className="btn-link" href={kakaoPlaceIdMapLink(item) ?? "#"} target="_blank" rel="noreferrer">카카오지도</a>
                            ) : null}
                            <a className="btn-ghost" href={naverSearchLink(item)} target="_blank" rel="noreferrer">네이버지도</a>
                          </>
                        ) : (
                          <a className="btn-link" href={googlePlaceLink(item)} target="_blank" rel="noreferrer">지도 보기</a>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="result-tags">
                        <p className="meta">{formatDistance(item.distance_m)}</p>
                        <p className="meta">{"₩".repeat(item.price_level)}</p>
                        <p className="meta">★{item.rating}</p>
                      </div>
                      <p className="reason"><span className="category-chip">{item.raw_category || item.category || "기타"}</span></p>
                      <p className="reason">{item.why.map(localizeReason).join(" · ") || "추천 이유 계산 중"}</p>
                      <div className="btn-row">
                        {useKrLinks ? (
                          <>
                            {kakaoPlaceIdMapLink(item) ? (
                              <a className="btn-link" href={kakaoPlaceIdMapLink(item) ?? "#"} target="_blank" rel="noreferrer">카카오 지도 보기</a>
                            ) : null}
                            <a className="btn-ghost" href={naverSearchLink(item)} target="_blank" rel="noreferrer">네이버 지도 보기</a>
                          </>
                        ) : (
                          <a className="btn-link" href={googlePlaceLink(item)} target="_blank" rel="noreferrer">구글 지도 보기</a>
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
          <section className="result-editor-sheet" role="dialog" aria-modal="true" aria-label="검색 조건 변경">
            <header className="result-editor-head">
              <h2>검색 조건 조정</h2>
              <button type="button" className="btn-ghost" onClick={() => setFilterOpen(false)}>닫기</button>
            </header>

            <div className="result-editor-body">
              <article className="result-editor-card">
                <h3>언제 드시나요?</h3>
                <div className="result-editor-meal-grid">
                  <button type="button" className={draftMode === "lunch" ? "active" : ""} onClick={() => setDraftMode("lunch")}>
                    점심
                  </button>
                  <button type="button" className={draftMode === "dinner" ? "active" : ""} onClick={() => setDraftMode("dinner")}>
                    저녁
                  </button>
                </div>
              </article>

              <article className="result-editor-card">
                <div className="result-editor-row">
                  <h3>거리 범위</h3>
                  <strong>{formatRadius(draftRadius)} 이내</strong>
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
                      aria-label="검색 반경"
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
                        {formatRadius(value)}
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <article className="result-editor-card">
                <h3>오늘의 바이브</h3>
                <div className="result-editor-vibe-grid">
                  {VIBE_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={draftRandomness === option.value ? "active" : ""}
                      onClick={() => setDraftRandomness(option.value)}
                    >
                      <strong>{option.title}</strong>
                      <span>{option.desc}</span>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <footer className="result-editor-actions">
              <button type="button" className="btn-ghost" onClick={() => setFilterOpen(false)}>취소</button>
              <button type="button" className="btn-primary" onClick={applyFilterChanges}>적용 후 재검색</button>
            </footer>
          </section>
        </div>
      ) : null}

      {locationOpen ? (
        <div className="result-editor-backdrop" onClick={(e) => e.target === e.currentTarget && setLocationOpen(false)}>
          <section className="result-editor-sheet" role="dialog" aria-modal="true" aria-label="위치 변경">
            <header className="result-editor-head">
              <h2>검색 위치 변경</h2>
              <button type="button" className="btn-ghost" onClick={() => setLocationOpen(false)}>닫기</button>
            </header>

            <div className="result-editor-body">
              <article className="result-editor-card">
                <h3>주소 / 도시명 / 좌표(lat,lng)</h3>
                <div className="result-editor-search">
                  <input
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="예: 성수역 또는 37.544, 127.055"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchLocation();
                      }
                    }}
                  />
                  <button type="button" className="btn-ghost" onClick={searchLocation} disabled={locationLoading || geolocationLoading}>
                    {locationLoading ? "검색 중..." : "검색"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={useCurrentLocation} disabled={locationLoading || geolocationLoading}>
                    {geolocationLoading ? "확인 중..." : "현재 위치"}
                  </button>
                </div>
              </article>

              <article className="result-editor-card">
                <h3>지도에서 직접 위치 선택</h3>
                {locationPreview ? (
                  <>
                    <LocationPicker
                      value={{ lat: locationPreview.lat, lng: locationPreview.lng }}
                      onChange={(next) =>
                        setLocationPreview({
                          lat: next.lat,
                          lng: next.lng,
                          label: "지도에서 선택한 위치",
                          countryCode: undefined,
                        })
                      }
                    />
                    <p className="result-editor-help">
                      {locationPreview.label ?? "선택 위치"} · {locationPreview.lat.toFixed(5)}, {locationPreview.lng.toFixed(5)}
                    </p>
                  </>
                ) : (
                  <p className="result-editor-help">먼저 검색하거나 현재 위치 버튼을 눌러 기준 위치를 설정해 주세요.</p>
                )}
              </article>
              {locationError ? <p className="error-text">{locationError}</p> : null}
            </div>

            <footer className="result-editor-actions">
              <button type="button" className="btn-ghost" onClick={() => setLocationOpen(false)}>취소</button>
              <button type="button" className="btn-primary" onClick={applyLocationChanges} disabled={!locationPreview}>
                이 위치로 재검색
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
