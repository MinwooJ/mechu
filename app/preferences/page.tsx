"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { RandomnessLevel, RecommendMode } from "@/lib/reco/types";
import { loadFlowState, saveFlowState } from "@/lib/flow/state";

export default function PreferencesPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RecommendMode>("lunch");
  const [radius, setRadius] = useState(1000);
  const [randomness, setRandomness] = useState<RandomnessLevel>("balanced");

  useEffect(() => {
    const current = loadFlowState();
    setMode(current.mode);
    setRadius(current.radius);
    setRandomness(current.randomness);
  }, []);

  const startRecommendation = () => {
    const current = loadFlowState();
    saveFlowState({ ...current, mode, radius, randomness });
    router.push("/results");
  };

  return (
    <main className="flow-page preferences">
      <section className="headline section-shell">
        <p className="chip">MAKE A CHOICE</p>
        <h1>What are we eating today?</h1>
        <p>점심/저녁 타입과 추천 무드를 고르면 결과를 바로 만들어 드려요.</p>
      </section>

      <section className="meal-grid section-shell">
        <button className={`meal-block ${mode === "lunch" ? "active" : ""}`} onClick={() => setMode("lunch")}>
          <strong>LUNCH / 점메추</strong>
          <span>Quick & energizing</span>
        </button>
        <button className={`meal-block ${mode === "dinner" ? "active" : ""}`} onClick={() => setMode("dinner")}>
          <strong>DINNER / 저메추</strong>
          <span>Relaxed & savory</span>
        </button>
      </section>

      <section className="controls section-shell">
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
            <option value="stable">Famous Spots</option>
            <option value="balanced">Balanced Choice</option>
            <option value="explore">Hidden Gems</option>
          </select>
        </label>

        <button className="btn-primary" onClick={startRecommendation}>Find Food</button>
      </section>
    </main>
  );
}
