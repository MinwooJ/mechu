import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/reco/service";
import type { RecommendationEvent } from "@/lib/reco/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationEvent;
    if (!body?.event_type) {
      return NextResponse.json({ error: "event_type is required" }, { status: 400 });
    }
    recordEvent(body);
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
