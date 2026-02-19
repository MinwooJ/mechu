import { NextResponse } from "next/server";

import { getRecommendations } from "@/lib/reco/service";
import type { RecommendationRequest } from "@/lib/reco/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationRequest;
    if (typeof body?.lat !== "number" || typeof body?.lng !== "number" || !body?.mode) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json(getRecommendations(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
