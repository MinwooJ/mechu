"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { loadFlowState, saveFlowState } from "@/lib/flow/state";

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

const LocationPicker = dynamic(() => import("./location-picker"), { ssr: false });

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

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewPoint | null>(null);

  useEffect(() => {
    const current = loadFlowState();
    if (current.position) {
      setPreview({ lat: current.position.lat, lng: current.position.lng, label: "최근 사용 위치" });
    } else {
      setPreview({ lat: 37.5665, lng: 126.978, label: "기본 위치" });
    }
  }, []);

  const moveWithPosition = (lat: number, lng: number, countryCode?: string) => {
    const current = loadFlowState();
    const searchCountry = countryCode ?? inferSearchCountry(lat, lng);
    saveFlowState({
      ...current,
      position: { lat, lng },
      countryCode: searchCountry,
    });
    router.push("/preferences");
  };

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setError("브라우저에서 위치 기능을 지원하지 않아요.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        moveWithPosition(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLoading(false);
        setError("위치 권한을 허용하면 주변 추천을 받을 수 있어요.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  };

  const searchManualLocation = async () => {
    const q = manualQuery.trim();
    if (q.length < 2) {
      setError("주소, 도시명, 또는 좌표를 입력해 주세요.");
      return;
    }

    const latLng = parseLatLng(q);
    if (latLng) {
      setError(null);
      setPreview((prev) => ({
        lat: latLng.lat,
        lng: latLng.lng,
        label: "좌표 검색 결과",
        countryCode: inferSearchCountry(latLng.lat, latLng.lng),
      }));
      return;
    }

    setManualLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as GeocodeResponse;

      if (!response.ok || !data.ok || typeof data.lat !== "number" || typeof data.lng !== "number") {
        if (data.reason === "missing_api_key") {
          setError("Google Maps API 키가 없어 직접 위치 입력을 사용할 수 없어요.");
        } else {
          setError("입력한 위치를 찾지 못했어요. 다른 키워드로 시도해 주세요.");
        }
        return;
      }

      setPreview({
        lat: data.lat,
        lng: data.lng,
        label: data.label,
        countryCode: normalizeCountryCode(data.country_code),
      });
    } catch {
      setError("위치 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setManualLoading(false);
    }
  };

  const applyManualLocation = () => {
    if (!preview) {
      setError("먼저 위치를 검색해 주세요.");
      return;
    }
    setError(null);
    moveWithPosition(preview.lat, preview.lng, preview.countryCode);
  };

  return (
    <main className="flow-page onboard">
      <section className="onboard-stage section-shell">
        <FlowHeader overlay />
        <div className="onboard-bg" />
        <div className="onboard-gradient" />

        <div className="onboard-center">
          <p className="chip"><span className="chip-dot" />DISCOVER LOCAL GEMS</p>
          <h1>
            <span>점메추?</span>
            <span>저메추?</span>
          </h1>
          <p>
            지금 당신 주변의 숨겨진 찐맛집을 찾아드릴게요.
            <br />
            오늘의 메뉴 고민, 저희가 해결해 드립니다.
          </p>

          <section className="onboard-card">
            <div className="onboard-icon-wrap" aria-hidden>
              <div className="onboard-icon-core">📍</div>
            </div>
            <button className="btn-primary" onClick={allowLocation} disabled={loading || manualLoading}>
              {loading ? "위치 확인 중..." : "내 위치 허용하기"}
            </button>
            <button className="btn-ghost" onClick={() => setManualOpen((prev) => !prev)} disabled={loading || manualLoading}>
              {manualOpen ? "직접 입력 닫기" : "직접 위치 입력하기"}
            </button>

            {manualOpen ? (
              <div className="manual-form">
                <label>
                  주소 / 도시명 / 좌표(lat,lng)
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="예: Gangnam Station 또는 37.498, 127.028"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchManualLocation();
                      }
                    }}
                  />
                </label>

                <div className="btn-row manual-actions">
                  <button className="btn-ghost" onClick={searchManualLocation} disabled={manualLoading || loading}>
                    {manualLoading ? "검색 중..." : "위치 검색"}
                  </button>
                  <button className="btn-primary" onClick={applyManualLocation} disabled={manualLoading || loading || !preview}>
                    이 위치로 계속
                  </button>
                </div>

                {preview ? (
                  <>
                    <LocationPicker
                      value={{ lat: preview.lat, lng: preview.lng }}
                      onChange={(next) =>
                        setPreview((prev) => ({
                          lat: next.lat,
                          lng: next.lng,
                          label: "지도에서 선택한 위치",
                          countryCode: inferSearchCountry(next.lat, next.lng),
                        }))
                      }
                    />
                    <p className="manual-map-label">{preview.label ?? `${preview.lat.toFixed(5)}, ${preview.lng.toFixed(5)}`}</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="error-text">{error}</p> : null}
          </section>
          <p className="muted"><span aria-hidden>🔒</span> 위치 정보는 추천 목적에만 사용됩니다.</p>
        </div>
      </section>
    </main>
  );
}
