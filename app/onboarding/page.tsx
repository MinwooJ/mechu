"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { loadFlowState, saveFlowState } from "@/lib/flow/state";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setError("브라우저에서 위치 기능을 지원하지 않아요.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const current = loadFlowState();
        saveFlowState({
          ...current,
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        router.push("/preferences");
      },
      () => {
        setLoading(false);
        setError("위치 권한을 허용하면 주변 추천을 받을 수 있어요.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  };

  return (
    <main className="flow-page onboard">
      <section className="onboard-hero">
        <p className="chip">DISCOVER LOCAL GEMS</p>
        <h1>
          <span>점메추?</span>
          <span>저메추?</span>
        </h1>
        <p>지금 당신 주변의 가게 데이터를 기반으로 오늘의 메뉴 고민을 빠르게 해결해 드릴게요.</p>
      </section>

      <section className="onboard-card">
        <button className="btn-primary" onClick={allowLocation} disabled={loading}>
          {loading ? "위치 확인 중..." : "내 위치 허용하기"}
        </button>
        <button className="btn-ghost" onClick={() => router.push("/preferences")}>직접 위치 설정하기</button>
        {error ? <p className="error-text">{error}</p> : <p className="muted">위치 정보는 추천 목적에만 사용됩니다.</p>}
      </section>
    </main>
  );
}
