"use client";

import { useMemo, useState } from "react";

import type { RandomnessLevel, RecommendMode, RecommendationItem, RecommendationResponse } from "@/lib/reco/types";

function getSessionId(): string {
  const key = "meal_reco_session_id";
  const existing = globalThis.localStorage?.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  globalThis.localStorage?.setItem(key, created);
  return created;
}

export default function Page() {
  const [mode, setMode] = useState<RecommendMode>("lunch");
  const [radius, setRadius] = useState<number>(1000);
  const [randomness, setRandomness] = useState<RandomnessLevel>("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [recentShown, setRecentShown] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);

  const disabled = useMemo(() => loading || !position, [loading, position]);

  const resolvePosition = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError("브라우저가 위치 정보를 지원하지 않아요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setError("위치 권한이 필요해요. 권한을 허용하거나 브라우저 설정을 확인해 주세요."),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 8000 },
    );
  };

  const fetchRecommendations = async () => {
    if (!position) return;
    setLoading(true);
    setError(null);

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
          exclude_place_ids: excluded,
          recently_shown_place_ids: recentShown,
        }),
      });
      const data = (await response.json()) as RecommendationResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("추천 요청에 실패했어요.");
      }
      if (data.status === "quota_exceeded") {
        setItems([]);
        setRemaining(0);
        setError("오늘 무료 추천 한도를 모두 사용했어요.");
        return;
      }
      if (data.status === "unsupported_region") {
        setItems([]);
        setRemaining(data.remaining_daily_quota);
        setError("현재 지역은 지원되지 않아요.");
        return;
      }
      setItems(data.recommendations);
      setRemaining(data.remaining_daily_quota);
      setRecentShown(data.recommendations.map((item) => item.place_id).slice(0, 20));
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
      setError("네트워크 또는 서버 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  const onExclude = (placeId: string) => {
    setExcluded((prev) => Array.from(new Set([...prev, placeId])));
    setItems((prev) => prev.filter((item) => item.place_id !== placeId));
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_type: "exclude", place_id: placeId, session_id: getSessionId(), mode }),
    }).catch(() => undefined);
  };

  return (
    <main>
      <section className="card">
        <h1 className="title">점메추 / 저메추</h1>
        <p className="subtitle">위치 기반 익명 추천 웹 MVP (TypeScript)</p>
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
          <button onClick={resolvePosition}>위치 확인</button>
          <button className="primary" disabled={disabled} onClick={fetchRecommendations}>
            {loading ? "추천 중..." : "추천 받기"}
          </button>
        </div>
        <div className="toolbar">
          <span className="pill">
            위치:{" "}
            {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "미확인"}
          </span>
          <span className="pill">남은 무료 추천: {remaining ?? "-"}</span>
        </div>
        {error ? <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p> : null}
      </section>

      <section className="items grid">
        {items.map((item) => (
          <article key={item.place_id} className="card item">
            <div className="row">
              <h3>{item.name}</h3>
              <span className="pill">{item.distance_m}m</span>
            </div>
            <p>
              카테고리: {item.category} | 가격: {"₩".repeat(item.price_level)} | 평점: {item.rating}
            </p>
            <p>{item.why.join(" · ")}</p>
            <div className="toolbar">
              <a href={item.directions_url} target="_blank" rel="noreferrer">
                <button>길찾기</button>
              </a>
              <button onClick={() => onExclude(item.place_id)}>제외</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
