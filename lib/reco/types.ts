export type RecommendMode = "lunch" | "dinner";
export type RandomnessLevel = "stable" | "balanced" | "explore";
export type EventType = "impression" | "click" | "directions" | "exclude" | "reshuffle";

export type RecommendationRequest = {
  lat: number;
  lng: number;
  mode: RecommendMode;
  radius_m?: number;
  limit?: number;
  categories?: string[];
  price_levels?: number[];
  open_now?: boolean;
  randomness_level?: RandomnessLevel;
  exclude_place_ids?: string[];
  recently_shown_place_ids?: string[];
  country_code?: string | null;
  session_id?: string | null;
};

export type RecommendationItem = {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  distance_m: number;
  category: string;
  price_level: number;
  rating: number;
  open_now: boolean;
  why: string[];
  directions_url: string;
};

export type RecommendationResponse = {
  status: "ok" | "quota_exceeded" | "unsupported_region";
  message?: string;
  mode: RecommendMode;
  remaining_daily_quota: number;
  recommendations: RecommendationItem[];
};

export type AvailabilityResponse = {
  supported: boolean;
  reason: string | null;
  remaining_daily_quota: number;
};

export type RecommendationEvent = {
  event_type: EventType;
  place_id?: string;
  mode?: RecommendMode;
  session_id?: string;
  lat?: number;
  lng?: number;
};
