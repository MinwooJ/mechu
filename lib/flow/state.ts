import type { RandomnessLevel, RecommendMode } from "@/lib/reco/types";

export type FlowState = {
  countryCode: string;
  mode: RecommendMode;
  radius: number;
  randomness: RandomnessLevel;
  position: { lat: number; lng: number } | null;
};

const FLOW_KEY = "meal_reco_flow_state_v1";
const SESSION_KEY = "meal_reco_session_id";

export function inferCountryCode(): string {
  if (typeof window === "undefined") return "US";
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale.split("-")[1];
  return (region ?? "US").toUpperCase();
}

export function defaultFlowState(): FlowState {
  return {
    countryCode: inferCountryCode(),
    mode: "lunch",
    radius: 1000,
    randomness: "balanced",
    position: null,
  };
}

export function loadFlowState(): FlowState {
  if (typeof window === "undefined") return defaultFlowState();
  const raw = window.localStorage.getItem(FLOW_KEY);
  if (!raw) return defaultFlowState();

  try {
    const parsed = JSON.parse(raw) as Partial<FlowState>;
    return {
      ...defaultFlowState(),
      ...parsed,
      countryCode: (parsed.countryCode ?? inferCountryCode()).toUpperCase(),
    };
  } catch {
    return defaultFlowState();
  }
}

export function saveFlowState(next: FlowState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FLOW_KEY, JSON.stringify(next));
}

export function updateFlowState(patch: Partial<FlowState>): FlowState {
  const merged = { ...loadFlowState(), ...patch };
  saveFlowState(merged);
  return merged;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}
