"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { loadFlowState, saveFlowState } from "@/lib/flow/state";
import { inferSearchCountry, normalizeCountryCode, parseLatLng } from "@/lib/geo/location";
import { useLocaleHref, useT } from "@/lib/i18n/client";

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

export default function OnboardingPage() {
  const router = useRouter();
  const t = useT();
  const toLocale = useLocaleHref();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewPoint | null>(null);

  useEffect(() => {
    const current = loadFlowState();
    if (current.position) {
      setPreview({ lat: current.position.lat, lng: current.position.lng, label: t("onboarding.manualRecent") });
    } else {
      setPreview({ lat: 37.5665, lng: 126.978, label: t("onboarding.manualDefault") });
    }
  }, [t]);

  const moveWithPosition = (lat: number, lng: number, countryCode?: string) => {
    const current = loadFlowState();
    const searchCountry = countryCode ?? inferSearchCountry(lat, lng);
    saveFlowState({
      ...current,
      position: { lat, lng },
      countryCode: searchCountry,
    });
    router.push(toLocale("/preferences"));
  };

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setError(t("onboarding.errorNoGeolocation"));
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
        setError(t("onboarding.errorPermission"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  };

  const searchManualLocation = async () => {
    const q = manualQuery.trim();
    if (q.length < 2) {
      setError(t("onboarding.errorManualTooShort"));
      return;
    }

    const latLng = parseLatLng(q);
    if (latLng) {
      setError(null);
      setPreview((prev) => ({
        lat: latLng.lat,
        lng: latLng.lng,
        label: t("onboarding.manualCoordResult"),
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
          setError(t("onboarding.errorMissingApi"));
        } else {
          setError(t("onboarding.errorNotFound"));
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
      setError(t("onboarding.errorSearchFailed"));
    } finally {
      setManualLoading(false);
    }
  };

  const applyManualLocation = () => {
    if (!preview) {
      setError(t("onboarding.errorNoPreview"));
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
          <p className="chip"><span className="chip-dot" />{t("onboarding.chip")}</p>
          <h1>
            <span>{t("onboarding.titleTop")}</span>
            <span>{t("onboarding.titleBottom")}</span>
          </h1>
          <p>
            {t("onboarding.descriptionLine1")}
            <br />
            {t("onboarding.descriptionLine2")}
          </p>

          <section className="onboard-card">
            <div className="onboard-icon-wrap" aria-hidden>
              <div className="onboard-icon-core">📍</div>
            </div>
            <button className="btn-primary" onClick={allowLocation} disabled={loading || manualLoading}>
              {loading ? t("onboarding.checkingLocation") : t("onboarding.allowLocation")}
            </button>
            <button className="btn-ghost" onClick={() => setManualOpen((prev) => !prev)} disabled={loading || manualLoading}>
              {manualOpen ? t("onboarding.manualClose") : t("onboarding.manualOpen")}
            </button>

            {manualOpen ? (
              <div className="manual-form">
                <label>
                  {t("onboarding.manualLabel")}
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder={t("onboarding.manualPlaceholder")}
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
                    {manualLoading ? t("onboarding.manualSearching") : t("onboarding.manualSearch")}
                  </button>
                  <button className="btn-primary" onClick={applyManualLocation} disabled={manualLoading || loading || !preview}>
                    {t("common.continue")}
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
                          label: t("onboarding.manualMapSelected"),
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
          <p className="muted"><span aria-hidden>🔒</span> {t("onboarding.privacy")}</p>
        </div>
      </section>
    </main>
  );
}
