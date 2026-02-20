# MECHU Recommendation Algorithm (Current)

This document describes how recommendation scoring currently works in code.
Source of truth: `lib/reco/service.ts`.

## 1. Request normalization

Input is sanitized in `sanitizeRequest()`:

- `radius_m`: clamped to `100..5000`
- `limit`: clamped to `1..MAX_LIMIT` (default from env)
- `categories`: lowercased (optional)
- `price_levels`: only `1..4` (optional)
- `open_now`: boolean (default false)
- `randomness_level`: `stable | balanced | explore` (default `balanced`)
- `exclude_place_ids`, `recently_shown_place_ids` respected
- `country_code`, `session_id` carried through

## 2. Provider selection and fallback

Country-based source priority:

- KR + Kakao key present:
  1. Kakao Local category search (`FD6`, food)
  2. Fallback to Google Places Nearby if Kakao returns zero
- Non-KR:
  1. Google Places Nearby

If all providers fail (network/provider error), response status is `source_error`.
If provider call succeeds but no places match filters, response status is `ok` with empty list.

## 3. Candidate collection

### 3.1 Google

- Endpoint: Places Nearby Search
- Query: `type=restaurant`, `radius=radius_m`
- Pagination: up to `GOOGLE_NEARBY_MAX_PAGES` (default 3)
- Excludes `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`
- Distance: computed by haversine from search origin
- `open_now`: set to true only when `opening_hours.open_now === true`

### 3.2 Kakao

- Endpoint: Local category search (`category_group_code=FD6`)
- Radius fan-out for larger search:
  - `>=2500m`: center + 8 ring centers
  - `>=1500m`: center + 4 ring centers
- Distance: always recomputed with haversine from user origin
- `open_now`: currently unknown from this API path, treated as false

## 4. Filtering pipeline

Candidates are filtered by:

1. Inside radius (`distance_m <= radius_m`)
2. Not in excluded IDs
3. Category filter (if provided)
4. Price filter (if provided)
5. Open-now filter (only if `open_now=true` requested)

Note for KR:

- When `open_now=true`, Kakao-only candidates are not reliable for open status,
  so Google candidates are used for open-now filtering.
- 현재 UI에서는 `open_now` 필터를 노출하지 않으며, API 확장 옵션으로만 남아 있습니다.

## 5. Scoring model (Phase 1 vibe)

For each filtered candidate:

- `ratingScore = rating / 5`
- `popularityScore`:
  - Google: log-normalized `review_count`
  - Kakao / unknown: provider fallback baseline
- `typeFit`: mode 선호 카테고리면 높게, 아니면 낮게
- `openScore`: `open_now` 여부(0/1)
- `noveltyScore`: 최근 노출이면 0, 아니면 1
- `rarityScore`: 동일 카테고리 후보가 적을수록 높음
- `repeatPenalty = -0.25` if place appears in recent list
- `noise = random(0..1) * noiseScale`
  - `stable`: `0.06`
  - `balanced`: `0.14`
  - `explore`: `0.26`

Vibe mapping:

- `stable` -> `safe`
- `balanced` -> `hot`
- `explore` -> `explore`

Current vibe score formulas:

```text
safe    = rating*0.34 + popularity*0.28 + open*0.20 + typeFit*0.12 + novelty*0.06
hot     = popularity*0.32 + rating*0.24 + open*0.16 + typeFit*0.18 + novelty*0.10
explore = novelty*0.30 + rarity*0.30 + typeFit*0.22 + rating*0.18

finalScore = vibeScore + noise - repeatPenalty
```

Distance is not used directly in score.
Distance is used as a hard radius filter only.

## 6. Selection algorithm (Top-N)

After scoring:

1. Sort by score desc
2. Build a weighted random pool:
   - weight = `max(score, 0.01)`
3. Pick one item by weighted probability
4. Remove picked item from pool
5. Apply diversity penalty to same-category remaining items:
   - same category score *= `0.9`
6. Repeat until `limit` reached or pool empty

This means final top-N is not strictly deterministic score rank;
it is score-biased randomized selection.

## 7. Reason tags shown to user (`why`)

Reasons are generated from heuristics:

- `Near your location` if distance ratio is high
- `Fits your time-of-day preference` if mode affinity hit preferred bucket
- `Open now` when provider open signal exists (`candidate.open_now=true`)
- `Popular now` when popularity score is high
- `Hidden gem pick` when explore mode + lower popularity bucket
- `Highly rated` when rating >= 4.4

Up to 3 reasons are kept.

## 8. Availability behavior

- No daily quota limit is enforced.
- Country support gate via `RECO_UNSUPPORTED_COUNTRIES`

## 9. Known limitations

1. Kakao path does not currently provide reliable open/closed state.
2. Kakao rating/price are normalized defaults in current implementation.
3. Google/Kakao category taxonomies differ; internal category mapping is coarse.
4. Weighted random introduces expected variance by design.

## 10. Category filtering feasibility (investigation summary)

Category filtering is feasible with current architecture.

Why:

- Request type already supports `categories?: string[]`
- Filter is already implemented in scoring pipeline
- Google and Kakao both expose category-related metadata

Current gap is mainly product/UI:

- Need a stable cross-provider category dictionary
- Need UI for multi-select categories
- Need fallback handling when one provider has sparse category labels

Recommended rollout:

1. Expose fixed internal categories first (korean, japanese, western, cafe, etc.)
2. Add optional "raw category" chips for transparency
3. Measure empty-result rate per category and tune mappings
