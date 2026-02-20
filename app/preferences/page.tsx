"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { RandomnessLevel, RecommendMode } from "@/lib/reco/types";
import FlowHeader from "@/app/components/flow-header";
import { loadFlowState, saveFlowState } from "@/lib/flow/state";

const VIBE_OPTIONS: Array<{
  value: RandomnessLevel;
  emoji: string;
  title: string;
  descA: string;
  descB: string;
}> = [
  { value: "stable", emoji: "🛡️", title: "안전빵", descA: "별점 4.0 이상", descB: "검증된 맛집" },
  { value: "balanced", emoji: "🔥", title: "요즘 핫한", descA: "SNS 인기", descB: "웨이팅 있음" },
  { value: "explore", emoji: "🎲", title: "모험가", descA: "숨은 로컬", descB: "나만 아는 곳" },
];

function formatRadius(radius: number): string {
  if (radius >= 1000) {
    return `${(radius / 1000).toFixed(radius % 1000 === 0 ? 0 : 1)}km`;
  }
  return `${radius}m`;
}

export default function PreferencesPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RecommendMode>("lunch");
  const [radius, setRadius] = useState(1000);
  const [randomness, setRandomness] = useState<RandomnessLevel>("balanced");

  useEffect(() => {
    const current = loadFlowState();
    setMode(current.mode);
    setRadius(Math.max(100, Math.min(current.radius, 3000)));
    setRandomness(current.randomness);
  }, []);

  const startRecommendation = () => {
    const current = loadFlowState();
    saveFlowState({ ...current, mode, radius, randomness });
    router.push("/results");
  };

  const resetPreferences = () => {
    setMode("lunch");
    setRadius(1000);
    setRandomness("balanced");
  };

  const radiusPct = ((radius - 100) / (3000 - 100)) * 100;
  const selectedVibe = VIBE_OPTIONS.find((v) => v.value === randomness) ?? VIBE_OPTIONS[1];

  return (
    <main className="flow-page preferences">
      <FlowHeader />
      <section className="pref-intro section-shell">
        <div>
          <h1>언제 드시나요?</h1>
          <p>오늘의 기분과 상황에 맞는 최고의 맛집을 찾아드릴게요.</p>
        </div>
        <button type="button" className="btn-ghost pref-reset" onClick={resetPreferences}>초기화</button>
      </section>

      <section className="pref-meal-grid section-shell">
        <button
          className={`pref-meal-card ${mode === "lunch" ? "active" : ""}`}
          onClick={() => setMode("lunch")}
          type="button"
        >
          <img src="/lunch.webp" alt="점심 추천" className="pref-meal-image" />
          <span className="pref-meal-overlay" />
          <span className="pref-meal-content">
            <small>LIGHT &amp; FRESH</small>
            <strong>점심</strong>
            <em>가볍고 활기찬 에너지 충전</em>
          </span>
          <span className="pref-check">✓</span>
        </button>

        <button
          className={`pref-meal-card ${mode === "dinner" ? "active" : ""}`}
          onClick={() => setMode("dinner")}
          type="button"
        >
          <img src="/dinner.webp" alt="저녁 추천" className="pref-meal-image" />
          <span className="pref-meal-overlay" />
          <span className="pref-meal-content">
            <small>MOOD &amp; CHILL</small>
            <strong>저녁</strong>
            <em>하루를 마무리하는 맛있는 위로</em>
          </span>
          <span className="pref-check">✓</span>
        </button>
      </section>

      <section className="pref-panels section-shell">
        <article className="pref-panel">
          <div className="pref-panel-head">
            <div>
              <h2>📍 거리 범위</h2>
              <p>현재 위치 기준 검색 반경</p>
            </div>
            <strong>{formatRadius(radius)} 이내</strong>
          </div>

          <div className="pref-radius-wrap">
            <div className="pref-radius-track">
              <span className="pref-radius-fill" style={{ width: `${radiusPct}%` }} />
              <input
                type="range"
                min={100}
                max={3000}
                step={100}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                aria-label="검색 반경"
              />
            </div>
            <div className="pref-radius-scale">
              <span>100m</span>
              <span>1km</span>
              <span>3km</span>
            </div>
            <div className="pref-radius-presets">
              {[500, 1000, 2000, 3000].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={radius === v ? "active" : ""}
                  onClick={() => setRadius(v)}
                >
                  {formatRadius(v)}
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="pref-panel">
          <div className="pref-panel-head">
            <div>
              <h2>🎲 오늘의 바이브</h2>
              <p>원하는 맛집 스타일 선택 (랜덤 추천)</p>
            </div>
          </div>

          <div className="pref-vibe-grid">
            {VIBE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pref-vibe-card ${randomness === option.value ? "active" : ""}`}
                onClick={() => setRandomness(option.value)}
              >
                <span className="pref-vibe-emoji">{option.emoji}</span>
                <strong>{option.title}</strong>
                <em>{option.descA}</em>
                <em>{option.descB}</em>
                <i>●</i>
              </button>
            ))}
          </div>

        </article>
      </section>

      <footer className="pref-cta-bar">
        <div className="pref-cta-inner">
          <p className="pref-selected">
            <span>선택된 필터</span>
            <strong>{mode === "lunch" ? "점심" : "저녁"} · {formatRadius(radius)} · {selectedVibe.title}</strong>
          </p>

          <button className="pref-cta-btn" onClick={startRecommendation}>
            <span>맛집 찾기</span>
            <small>{mode === "lunch" ? "점심" : "저녁"} · {formatRadius(radius)} · {selectedVibe.title}</small>
            <i>→</i>
          </button>
        </div>
      </footer>
    </main>
  );
}
