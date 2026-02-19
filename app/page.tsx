"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  AvailabilityResponse,
  RandomnessLevel,
  RecommendMode,
  RecommendationItem,
  RecommendationResponse,
} from "@/lib/reco/types";

type UiState =
  | "idle"
  | "need_location"
  | "loading"
  | "ready"
  | "empty"
  | "unsupported"
  | "quota_exceeded"
  | "error";

const STATE_COPY: Record<UiState, { title: string; body: string; action: string }> = {
  idle: { title: "준비 완료", body: "위치를 확인하고 추천 받기를 눌러 주세요.", action: "추천 받기" },
  need_location: { title: "위치 권한 필요", body: "위치 권한이 있어야 주변 추천이 가능해요.", action: "위치 확인" },
  loading: { title: "추천 계산 중", body: "거리/시간대/랜덤 요소를 조합하는 중이에요.", action: "잠시만 기다려 주세요" },
  ready: { title: "추천 완료", body: "카드를 선택하면 지도 포커스가 이동해요.", action: "다시 추천" },
  empty: { title: "결과 없음", body: "반경을 넓히거나 탐험 추천으로 바꿔 보세요.", action: "조건 조정" },
  unsupported: { title: "미지원 지역", body: "현재 국가 코드에서 서비스를 지원하지 않아요.", action: "국가 변경" },
  quota_exceeded: { title: "오늘 한도 종료", body: "오늘 무료 추천 한도를 모두 사용했어요.", action: "내일 다시" },
  error: { title: "네트워크 오류", body: "연결 상태를 확인하고 다시 시도해 주세요.", action: "다시 시도" },
};

function getSessionId(): string {
  const key = "meal_reco_session_id";
  const existing = globalThis.localStorage?.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  globalThis.localStorage?.setItem(key, created);
  return created;
}

function inferCountryCode(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale.split("-")[1];
  return (region ?? "US").toUpperCase();
}

function mapEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

export default function Page() {
  const [mode, setMode] = useState<RecommendMode>("lunch");
  const [radius, setRadius] = useState<number>(1000);
  const [randomness, setRandomness] = useState<RandomnessLevel>("balanced");
  const [state, setState] = useState<UiState>("need_location");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [recentShown, setRecentShown] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>(inferCountryCode());

  const selectedItem = useMemo(() => {
    if (!selectedPlaceId) return items[0] ?? null;
    return items.find((item) => item.place_id === selectedPlaceId) ?? items[0] ?? null;
  }, [items, selectedPlaceId]);

  const loading = state === "loading";
  const canRequest = Boolean(position) && !loading;
  const stateCopy = STATE_COPY[state];

  useEffect(() => {
    if (!position) return;

    fetch(`/api/availability?country_code=${countryCode}`)
      .then((res) => res.json() as Promise<AvailabilityResponse>)
      .then((data) => {
        setRemaining(data.remaining_daily_quota);
        if (!data.supported) {
          setItems([]);
          setState("unsupported");
        }
      })
      .catch(() => undefined);
  }, [countryCode, position]);

  const resolvePosition = () => {
    if (!navigator.geolocation) {
      setState("error");
      return;
    }

    setState("loading");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("idle");
      },
      () => setState("need_location"),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 8000 },
    );
  };

  const fetchRecommendations = async () => {
    if (!position) {
      setState("need_location");
      return;
    }

    setState("loading");

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: position.lat,
          lng: position.lng,
          mode,
          radius_m: radius,
          randomness_level: randomness,
          session_id: getSessionId(),
          country_code: countryCode,
          exclude_place_ids: excluded,
          recently_shown_place_ids: recentShown,
        }),
      });

      const data = (await response.json()) as RecommendationResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("recommendation failed");
      }

      setRemaining(data.remaining_daily_quota);

      if (data.status === "quota_exceeded") {
        setItems([]);
        setState("quota_exceeded");
        return;
      }

      if (data.status === "unsupported_region") {
        setItems([]);
        setState("unsupported");
        return;
      }

      setItems(data.recommendations);
      setRecentShown(data.recommendations.map((item) => item.place_id).slice(0, 20));
      setSelectedPlaceId(data.recommendations[0]?.place_id ?? null);
      setState(data.recommendations.length > 0 ? "ready" : "empty");

      await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_type: "impression",
          session_id: getSessionId(),
          mode,
          lat: position.lat,
          lng: position.lng,
        }),
      });
    } catch {
      setState("error");
    }
  };

  const onExclude = (placeId: string) => {
    setExcluded((prev) => Array.from(new Set([...prev, placeId])));
    setItems((prev) => prev.filter((item) => item.place_id !== placeId));
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);

    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_type: "exclude", place_id: placeId, session_id: getSessionId(), mode }),
    }).catch(() => undefined);
  };

  const onDirections = (item: RecommendationItem) => {
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_type: "directions",
        place_id: item.place_id,
        session_id: getSessionId(),
        mode,
        lat: item.lat,
        lng: item.lng,
      }),
    }).catch(() => undefined);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✕</span>
          <strong>점메추</strong>
        </div>
        <nav className="top-links">
          <span>익명 모드</span>
          <span>무료 한도: {remaining ?? "-"}</span>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="badge">DISCOVER LOCAL GEMS</p>
          <h1>
            <span>점메추?</span>
            <span>저메추?</span>
          </h1>
          <p className="hero-copy">지금 주변의 실제 가게 데이터를 기반으로, 오늘의 메뉴 고민을 빠르게 끝내보세요.</p>

          <div className="hero-cta">
            <button className="cta-main" onClick={resolvePosition}>
              내 위치 허용하기
            </button>
            <div className="hero-subrow">
              <label>
                국가
                <input value={countryCode} maxLength={2} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
              </label>
              <label>
                반경
                <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                  <option value={500}>500m</option>
                  <option value={1000}>1km</option>
                  <option value={3000}>3km</option>
                </select>
              </label>
              <label>
                무드
                <select value={randomness} onChange={(e) => setRandomness(e.target.value as RandomnessLevel)}>
                  <option value="stable">안정</option>
                  <option value="balanced">균형</option>
                  <option value="explore">탐험</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="meal-chooser">
        <button className={`meal-card ${mode === "lunch" ? "active" : ""}`} onClick={() => setMode("lunch")}>
          <p>추천</p>
          <h3>LUNCH / 점메추</h3>
          <span>가볍고 빠른 점심 추천</span>
        </button>
        <button className={`meal-card ${mode === "dinner" ? "active" : ""}`} onClick={() => setMode("dinner")}>
          <p>추천</p>
          <h3>DINNER / 저메추</h3>
          <span>분위기 있는 저녁 추천</span>
        </button>
        <button className="find-btn" disabled={!canRequest} onClick={fetchRecommendations}>
          {loading ? "추천 중..." : "추천 받기"}
        </button>
      </section>

      <section className="content-grid">
        <article className="map-pane">
          <div className="pane-head">
            <h2>Map Preview</h2>
            {selectedItem ? (
              <a href={selectedItem.directions_url} target="_blank" rel="noreferrer">
                <button onClick={() => onDirections(selectedItem)}>Google Maps</button>
              </a>
            ) : null}
          </div>

          {selectedItem ? (
            <iframe title="selected-place-map" className="map-frame" src={mapEmbedUrl(selectedItem.lat, selectedItem.lng)} loading="lazy" />
          ) : position ? (
            <iframe title="current-position-map" className="map-frame" src={mapEmbedUrl(position.lat, position.lng)} loading="lazy" />
          ) : (
            <div className="map-empty">위치 확인 후 지도와 추천이 표시됩니다.</div>
          )}

          <div className="map-meta">
            <span>위치: {position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : "미확인"}</span>
            <span>모드: {mode}</span>
          </div>
        </article>

        <aside className="side-pane">
          <section className={`state-card state-${state}`}>
            <p className="state-kicker">STATUS</p>
            <h3>{stateCopy.title}</h3>
            <p>{stateCopy.body}</p>
            <div className="state-actions">
              <button onClick={resolvePosition}>위치 확인</button>
              <button disabled={!canRequest} onClick={fetchRecommendations}>
                {stateCopy.action}
              </button>
            </div>
          </section>

          <section className="result-head">
            <h3>Top Picks</h3>
            <span>{items.length} spots</span>
          </section>

          <section className="result-list">
            {items.map((item, idx) => (
              <article
                key={item.place_id}
                className={`result-card ${selectedItem?.place_id === item.place_id ? "active" : ""}`}
                onClick={() => setSelectedPlaceId(item.place_id)}
              >
                <div className="result-title-row">
                  <strong>{item.name}</strong>
                  {idx === 0 ? <span className="rank">#1 MATCH</span> : null}
                </div>
                <p className="result-meta">
                  {item.distance_m}m · {"₩".repeat(item.price_level)} · ★{item.rating}
                </p>
                <p className="result-reason">{item.why.join(" · ") || "추천 이유를 계산 중입니다."}</p>
                <div className="result-actions">
                  <a href={item.directions_url} target="_blank" rel="noreferrer">
                    <button onClick={() => onDirections(item)}>길찾기</button>
                  </a>
                  <button onClick={() => onExclude(item.place_id)}>제외</button>
                </div>
              </article>
            ))}
          </section>
        </aside>
      </section>
    </main>
  );
}
