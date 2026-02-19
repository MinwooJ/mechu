"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSessionId, loadFlowState, saveFlowState } from "@/lib/flow/state";
import type { AvailabilityResponse, RecommendationItem, RecommendationResponse } from "@/lib/reco/types";

function mapEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

export default function ResultsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      if (data.status === "quota_exceeded") {
        router.replace("/status?kind=quota_exceeded");
        return;
      }
      if (data.status === "unsupported_region") {
        router.replace("/status?kind=unsupported");
        return;
      }
      if (data.recommendations.length === 0) {
        router.replace("/status?kind=empty");
        return;
      }

      setItems(data.recommendations);
      setSelectedPlaceId(data.recommendations[0]?.place_id ?? null);

      await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_type: "impression",
          session_id: getSessionId(),
          mode: flow.mode,
          lat: flow.position.lat,
          lng: flow.position.lng,
        }),
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

  const onExclude = (placeId: string) => {
    setItems((prev) => prev.filter((item) => item.place_id !== placeId));
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);

    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_type: "exclude", place_id: placeId, session_id: getSessionId() }),
    }).catch(() => undefined);
  };

  const reroll = () => {
    setSelectedPlaceId(null);
    loadResults();
  };

  const goBack = () => {
    const flow = loadFlowState();
    saveFlowState(flow);
    router.push("/preferences");
  };

  return (
    <main className="flow-page results">
      <header className="result-top section-shell">
        <h1>Top Picks</h1>
        <div className="result-actions-top">
          <button className="btn-ghost" onClick={goBack}>조건 변경</button>
          <button className="btn-primary" onClick={reroll} disabled={loading}>{loading ? "로딩..." : "RE-ROLL"}</button>
        </div>
      </header>

      <section className="result-layout section-shell">
        <article className="map-panel">
          {selected ? (
            <iframe title="selected-place" className="map-frame" src={mapEmbedUrl(selected.lat, selected.lng)} loading="lazy" />
          ) : (
            <div className="map-empty">결과를 불러오는 중입니다.</div>
          )}
        </article>

        <article className="cards-panel">
          {items.map((item, idx) => (
            <article
              key={item.place_id}
              className={`result-card ${selected?.place_id === item.place_id ? "active" : ""}`}
              onClick={() => setSelectedPlaceId(item.place_id)}
            >
              <div className="title-row">
                <h3>{item.name}</h3>
                {idx === 0 ? <span className="chip-rank">#1 MATCH</span> : null}
              </div>
              <p className="meta">{item.distance_m}m · {"₩".repeat(item.price_level)} · ★{item.rating}</p>
              <p className="reason">{item.why.join(" · ") || "추천 이유 계산 중"}</p>
              <div className="btn-row">
                <a href={item.directions_url} target="_blank" rel="noreferrer">
                  <button className="btn-primary">길찾기</button>
                </a>
                <button className="btn-ghost" onClick={() => onExclude(item.place_id)}>제외</button>
              </div>
            </article>
          ))}
        </article>
      </section>
    </main>
  );
}
