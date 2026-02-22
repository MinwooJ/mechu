"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { RandomnessLevel, RecommendMode } from "@/lib/reco/types";
import FlowHeader from "@/app/components/flow-header";
import { loadFlowState, saveFlowState } from "@/lib/flow/state";
import { formatRadius } from "@/lib/i18n/format";
import { useLocale, useLocaleHref, useT } from "@/lib/i18n/client";

const VIBE_OPTIONS: Array<{
  value: RandomnessLevel;
  emoji: string;
  titleKey: string;
  descAKey: string;
  descBKey: string;
}> = [
  {
    value: "stable",
    emoji: "🛡️",
    titleKey: "preferences.vibe.stableTitle",
    descAKey: "preferences.vibe.stableA",
    descBKey: "preferences.vibe.stableB",
  },
  {
    value: "balanced",
    emoji: "🔥",
    titleKey: "preferences.vibe.balancedTitle",
    descAKey: "preferences.vibe.balancedA",
    descBKey: "preferences.vibe.balancedB",
  },
  {
    value: "explore",
    emoji: "🎲",
    titleKey: "preferences.vibe.exploreTitle",
    descAKey: "preferences.vibe.exploreA",
    descBKey: "preferences.vibe.exploreB",
  },
];

export default function PreferencesPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const toLocale = useLocaleHref();
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
    router.push(toLocale("/results"));
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
          <h1>{t("preferences.title")}</h1>
          <p>{t("preferences.subtitle")}</p>
        </div>
        <button type="button" className="btn-ghost pref-reset" onClick={resetPreferences}>
          {t("preferences.reset")}
        </button>
      </section>

      <section className="pref-meal-grid section-shell">
        <button
          className={`pref-meal-card ${mode === "lunch" ? "active" : ""}`}
          onClick={() => setMode("lunch")}
          type="button"
        >
          <img src="/lunch.webp" alt={t("preferences.meal.lunchName")} className="pref-meal-image" />
          <span className="pref-meal-overlay" />
          <span className="pref-meal-content">
            <small>{t("preferences.meal.lunchBadge")}</small>
            <strong>{t("preferences.meal.lunchName")}</strong>
            <em>{t("preferences.meal.lunchDesc")}</em>
          </span>
          <span className="pref-check">✓</span>
        </button>

        <button
          className={`pref-meal-card ${mode === "dinner" ? "active" : ""}`}
          onClick={() => setMode("dinner")}
          type="button"
        >
          <img src="/dinner.webp" alt={t("preferences.meal.dinnerName")} className="pref-meal-image" />
          <span className="pref-meal-overlay" />
          <span className="pref-meal-content">
            <small>{t("preferences.meal.dinnerBadge")}</small>
            <strong>{t("preferences.meal.dinnerName")}</strong>
            <em>{t("preferences.meal.dinnerDesc")}</em>
          </span>
          <span className="pref-check">✓</span>
        </button>
      </section>

      <section className="pref-panels section-shell">
        <article className="pref-panel">
          <div className="pref-panel-head">
            <div>
              <h2>{t("preferences.radius.title")}</h2>
              <p>{t("preferences.radius.desc")}</p>
            </div>
            <strong>{t("preferences.radius.within", { radius: formatRadius(radius, locale) })}</strong>
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
                aria-label={t("preferences.radius.title")}
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
                  {formatRadius(v, locale)}
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="pref-panel">
          <div className="pref-panel-head">
            <div>
              <h2>{t("preferences.vibe.title")}</h2>
              <p>{t("preferences.vibe.desc")}</p>
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
                <strong>{t(option.titleKey)}</strong>
                <em>{t(option.descAKey)}</em>
                <em>{t(option.descBKey)}</em>
                <i>●</i>
              </button>
            ))}
          </div>

        </article>
      </section>

      <footer className="pref-cta-bar">
        <div className="pref-cta-inner">
          <p className="pref-selected">
            <span>{t("preferences.selectedLabel")}</span>
            <strong>
              {mode === "lunch" ? t("mode.lunch") : t("mode.dinner")} · {formatRadius(radius, locale)} · {t(selectedVibe.titleKey)}
            </strong>
          </p>

          <button className="pref-cta-btn" onClick={startRecommendation}>
            <span>{t("preferences.find")}</span>
            <small>
              {mode === "lunch" ? t("mode.lunch") : t("mode.dinner")} · {formatRadius(radius, locale)} · {t(selectedVibe.titleKey)}
            </small>
            <i>→</i>
          </button>
        </div>
      </footer>
    </main>
  );
}
