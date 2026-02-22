import type { RandomnessLevel, RecommendMode } from "@/lib/reco/types";
import { inferSearchCountry, isValidLatLng, normalizeCountryCode } from "@/lib/geo/location";

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
  return normalizeCountryCode(region) ?? "US";
}

function inferCountryFromPosition(position?: FlowState["position"] | null): string | null {
  if (!position) return null;
  if (!isValidLatLng(position.lat, position.lng)) return null;
  return inferSearchCountry(position.lat, position.lng);
}

/**
 * Keep explicit non-US country codes (JP/TW/...) intact, but recover KR when
 * stale/missing state keeps "US" even though the selected coordinates are in Korea.
 */
export function resolveFlowCountryCode(
  flow: Pick<FlowState, "countryCode" | "position">,
  fallbackCountryCode: string = "US",
): string {
  const explicit = normalizeCountryCode(flow.countryCode) ?? null;
  const inferredFromPosition = inferCountryFromPosition(flow.position);

  if (explicit && explicit !== "US") return explicit;
  if (inferredFromPosition === "KR") return "KR";
  if (explicit) return explicit;
  return normalizeCountryCode(fallbackCountryCode) ?? "US";
}

function normalizeFlowPosition(position: unknown): FlowState["position"] {
  if (!position || typeof position !== "object") return null;
  const candidate = position as { lat?: unknown; lng?: unknown };
  if (typeof candidate.lat !== "number" || typeof candidate.lng !== "number") return null;
  if (!isValidLatLng(candidate.lat, candidate.lng)) return null;
  return { lat: candidate.lat, lng: candidate.lng };
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
    const normalizedPosition = normalizeFlowPosition(parsed.position);
    return {
      ...defaultFlowState(),
      ...parsed,
      position: normalizedPosition,
      countryCode: resolveFlowCountryCode(
        {
          countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode : "",
          position: normalizedPosition,
        },
        inferCountryCode(),
      ),
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
