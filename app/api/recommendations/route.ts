import { NextResponse } from "next/server";

import { isValidLatLng } from "@/lib/geo/location";
import { getRecommendations } from "@/lib/reco/service";
import type { RecommendationRequest } from "@/lib/reco/types";

function isMode(mode: unknown): mode is "lunch" | "dinner" {
  return mode === "lunch" || mode === "dinner";
}

type RateLimitEntry = { resetAt: number; count: number };

const RATE_LIMIT_WINDOW_MS = Math.max(1000, Math.min(Number(process.env.RECO_RATE_LIMIT_WINDOW_MS ?? "60000"), 600000));
const RATE_LIMIT_MAX = Math.max(5, Math.min(Number(process.env.RECO_RATE_LIMIT_MAX ?? "30"), 300));
const RATE_LIMIT_STORE_MAX = Math.max(500, Math.min(Number(process.env.RECO_RATE_LIMIT_STORE_MAX ?? "10000"), 100000));

function getRateLimitStore(): Map<string, RateLimitEntry> {
  const globalObject = globalThis as unknown as { __mechuRecoRateLimit?: Map<string, RateLimitEntry> };
  if (!globalObject.__mechuRecoRateLimit) {
    globalObject.__mechuRecoRateLimit = new Map();
  }
  return globalObject.__mechuRecoRateLimit;
}

function trimIp(input: string | null): string | null {
  if (!input) return null;
  const first = input.split(",")[0]?.trim();
  return first || null;
}

function clientKeyFromRequest(request: Request, sessionId?: string | null): string {
  const ip =
    trimIp(request.headers.get("cf-connecting-ip")) ??
    trimIp(request.headers.get("x-forwarded-for")) ??
    trimIp(request.headers.get("x-real-ip")) ??
    "unknown-ip";
  const session = sessionId && sessionId.trim() ? sessionId.trim() : "unknown-session";
  return `${ip}:${session}`;
}

function applyRateLimit(request: Request, sessionId?: string | null): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const store = getRateLimitStore();

  if (store.size > RATE_LIMIT_STORE_MAX) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
    if (store.size > RATE_LIMIT_STORE_MAX) {
      const overflow = store.size - RATE_LIMIT_STORE_MAX;
      let removed = 0;
      for (const key of store.keys()) {
        store.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }

  const clientKey = clientKeyFromRequest(request, sessionId);
  const existing = store.get(clientKey);
  if (!existing || existing.resetAt <= now) {
    store.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  existing.count += 1;
  store.set(clientKey, existing);
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationRequest;
    const sessionId = typeof body?.session_id === "string" ? body.session_id : null;

    const rateLimited = applyRateLimit(request, sessionId);
    if (!rateLimited.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rateLimited.retryAfterSec) } },
      );
    }

    if (
      typeof body?.lat !== "number" ||
      typeof body?.lng !== "number" ||
      !isValidLatLng(body.lat, body.lng) ||
      !isMode(body?.mode)
    ) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (body.session_id && (typeof body.session_id !== "string" || body.session_id.length > 120)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json(await getRecommendations(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
