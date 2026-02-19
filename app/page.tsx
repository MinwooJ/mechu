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
  const [statusMessage, setStatusMessage] = useState<string>("위치 확인 후 추천을 시작해 주세요.");
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
  const disabled = loading || !position;

  useEffect(() => {
    if (!position) return;

    fetch(`/api/availability?country_code=${countryCode}`)
      .then((res) => res.json() as Promise<AvailabilityResponse>)
      .then((data) => {
        setRemaining(data.remaining_daily_quota);
        if (!data.supported) {
          setState("unsupported");
          setStatusMessage("현재 선택한 국가는 지원되지 않아요.");
          setItems([]);
        }
      })
      .catch(() => undefined);
  }, [countryCode, position]);

  const resolvePosition = () => {
    if (!navigator.geolocation) {
      setState("error");
      setStatusMessage("브라우저가 위치 정보를 지원하지 않아요.");
      return;
    }

    setState("loading");
    setStatusMessage("현재 위치를 확인하고 있어요...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("idle");
        setStatusMessage("위치 확인 완료. 추천 받기를 눌러 주세요.");
      },
      () => {
        setState("need_location");
        setStatusMessage("위치 권한이 필요해요. 권한을 허용하거나 브라우저 설정을 확인해 주세요.");
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 8000 },
    );
  };

  const fetchRecommendations = async () => {
    if (!position) return;
    setState("loading");
    setStatusMessage("추천을 계산하고 있어요...");

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
        throw new Error("추천 요청에 실패했어요.");
      }

      setRemaining(data.remaining_daily_quota);

      if (data.status === "quota_exceeded") {
        setItems([]);
        setState("quota_exceeded");
        setStatusMessage("오늘 무료 추천 한도를 모두 사용했어요.");
        return;
      }
      if (data.status === "unsupported_region") {
        setItems([]);
        setState("unsupported");
        setStatusMessage("현재 지역은 지원되지 않아요.");
        return;
      }

      setItems(data.recommendations);
      setRecentShown(data.recommendations.map((item) => item.place_id).slice(0, 20));
      setSelectedPlaceId(data.recommendations[0]?.place_id ?? null);

      if (data.recommendations.length === 0) {
        setState("empty");
        setStatusMessage("조건에 맞는 결과를 찾지 못했어요. 반경이나 필터를 조정해 주세요.");
      } else {
        setState("ready");
        setStatusMessage("추천 결과를 확인해 보세요.");
      }

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
      setStatusMessage("네트워크 또는 서버 오류가 발생했어요.");
    }
  };

  const onExclude = (placeId: string) => {
    setExcluded((prev) => Array.from(new Set([...prev, placeId])));
    setItems((prev) => prev.filter((item) => item.place_id !== placeId));
    if (selectedPlaceId === placeId) {
      setSelectedPlaceId(null);
    }

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
    <main>
      <section className="card hero">
        <h1 className="title">점메추 / 저메추</h1>
        <p className="subtitle">지도 기반 익명 추천 MVP</p>

        <div className="toolbar">
          <button className={mode === "lunch" ? "primary" : ""} onClick={() => setMode("lunch")}>
            점메추
          </button>
          <button className={mode === "dinner" ? "primary" : ""} onClick={() => setMode("dinner")}>
            저메추
          </button>

          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            <option value={500}>500m</option>
            <option value={1000}>1km</option>
            <option value={3000}>3km</option>
          </select>

          <select value={randomness} onChange={(e) => setRandomness(e.target.value as RandomnessLevel)}>
            <option value="stable">안정 추천</option>
            <option value="balanced">균형 추천</option>
            <option value="explore">탐험 추천</option>
          </select>

          <input
            aria-label="country-code"
            className="country"
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            placeholder="KR"
          />

          <button onClick={resolvePosition}>위치 확인</button>
          <button className="primary" disabled={disabled} onClick={fetchRecommendations}>
            {loading ? "추천 중..." : "추천 받기"}
          </button>
        </div>

        <div className="toolbar compact">
          <span className="pill">
            위치: {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "미확인"}
          </span>
          <span className="pill">국가: {countryCode || "-"}</span>
          <span className="pill">남은 무료 추천: {remaining ?? "-"}</span>
        </div>
      </section>

      <section className="map-layout">
        <article className="card map-panel">
          <div className="row panel-head">
            <h2>지도</h2>
            {selectedItem ? (
              <a href={selectedItem.directions_url} target="_blank" rel="noreferrer">
                <button onClick={() => onDirections(selectedItem)}>Google 지도 열기</button>
              </a>
            ) : null}
          </div>

          {selectedItem ? (
            <iframe
              title="recommendation-map"
              src={mapEmbedUrl(selectedItem.lat, selectedItem.lng)}
              className="map-frame"
              loading="lazy"
            />
          ) : position ? (
            <iframe title="current-location-map" src={mapEmbedUrl(position.lat, position.lng)} className="map-frame" loading="lazy" />
          ) : (
            <div className="map-empty">위치를 확인하면 지도가 표시됩니다.</div>
          )}

          {selectedItem ? (
            <p className="map-caption">
              선택된 장소: <strong>{selectedItem.name}</strong> ({selectedItem.distance_m}m)
            </p>
          ) : null}
        </article>

        <article className="card status-panel">
          <h2>상태</h2>
          <p>{statusMessage}</p>

          {state === "need_location" ? <p className="hint">위치 권한 허용 후 다시 시도해 주세요.</p> : null}
          {state === "unsupported" ? <p className="hint">미지원 지역입니다. 다른 국가 코드로 테스트할 수 있어요.</p> : null}
          {state === "quota_exceeded" ? <p className="hint">오늘 한도 소진. 내일 다시 시도해 주세요.</p> : null}
          {state === "empty" ? <p className="hint">반경을 3km로 늘리거나 랜덤 강도를 탐험으로 바꿔 보세요.</p> : null}
          {state === "error" ? <p className="hint">일시 오류일 수 있어요. 잠시 후 재시도해 주세요.</p> : null}

          <div className="toolbar compact">
            <button onClick={resolvePosition}>위치 재확인</button>
            <button className="primary" disabled={disabled} onClick={fetchRecommendations}>
              다시 추천
            </button>
          </div>
        </article>
      </section>

      <section className="items grid">
        {items.map((item) => (
          <article
            key={item.place_id}
            className={`card item ${selectedItem?.place_id === item.place_id ? "active" : ""}`}
            onClick={() => setSelectedPlaceId(item.place_id)}
          >
            <div className="row">
              <h3>{item.name}</h3>
              <span className="pill">{item.distance_m}m</span>
            </div>
            <p>
              카테고리: {item.category} | 가격: {"₩".repeat(item.price_level)} | 평점: {item.rating}
            </p>
            <p>{item.why.join(" · ") || "추천 이유 데이터를 수집 중이에요."}</p>
            <div className="toolbar compact">
              <a href={item.directions_url} target="_blank" rel="noreferrer">
                <button onClick={() => onDirections(item)}>길찾기</button>
              </a>
              <button onClick={() => onExclude(item.place_id)}>제외</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
