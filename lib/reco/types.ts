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
  address?: string;
  raw_category?: string;
  lat: number;
  lng: number;
  distance_m: number;
  category: string;
  price_level: number;
  rating?: number;
  review_count?: number;
  open_now: boolean;
  why: string[];
  directions_url: string;
};

export type RecommendationResponse = {
  status: "ok" | "unsupported_region" | "source_error";
  message?: string;
  mode: RecommendMode;
  recommendations: RecommendationItem[];
};

export type AvailabilityResponse = {
  supported: boolean;
  reason: string | null;
};

export type RecommendationEvent = {
  event_type: EventType;
  place_id?: string;
  mode?: RecommendMode;
  session_id?: string;
  search_country?: string;
  ip_country?: string;
};
