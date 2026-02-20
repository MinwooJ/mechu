import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { recordEvent } from "@/lib/reco/service";
import type { RecommendationEvent } from "@/lib/reco/types";

type D1Database = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
    };
  };
};

const EVENT_TYPES = new Set(["impression", "click", "directions", "exclude", "reshuffle"]);
const MODES = new Set(["lunch", "dinner"]);

function normalizeCountryCode(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return undefined;
  return code;
}

async function insertEventToD1(db: D1Database, event: RecommendationEvent) {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO reco_events (
        ts, event_type, session_id, mode, ip_country, search_country
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      now,
      event.event_type,
      event.session_id ?? null,
      event.mode ?? null,
      event.ip_country ?? null,
      event.search_country ?? null,
    )
    .run();
}

export async function POST(request: Request) {
  let body: RecommendationEvent;
  try {
    body = (await request.json()) as RecommendationEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.event_type) {
    return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  }
  if (!EVENT_TYPES.has(body.event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (body.mode && !MODES.has(body.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (body.session_id && (typeof body.session_id !== "string" || body.session_id.length > 120)) {
    return NextResponse.json({ error: "Invalid session_id" }, { status: 400 });
  }

  const ipCountry = normalizeCountryCode(request.headers.get("cf-ipcountry"));
  const event: RecommendationEvent = {
    ...body,
    ip_country: normalizeCountryCode(body.ip_country) ?? ipCountry,
    search_country: normalizeCountryCode(body.search_country),
  };

  let inserted = false;
  try {
    const { env } = getCloudflareContext();
    const db = (env as { DB?: D1Database } | undefined)?.DB;
    if (db) {
      await insertEventToD1(db, event);
      inserted = true;
    }
  } catch {
    // Local dev or non-Cloudflare runtime: fallback to file log.
  }

  if (!inserted) {
    try {
      await recordEvent(event);
      inserted = true;
    } catch {
      return NextResponse.json({ error: "Failed to persist event" }, { status: 503 });
    }
  }

  return NextResponse.json({ accepted: true });
}
