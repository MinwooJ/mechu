import { NextRequest, NextResponse } from "next/server";

import { getAvailability } from "@/lib/reco/service";

export async function GET(request: NextRequest) {
  const countryCode = request.nextUrl.searchParams.get("country_code");
  return NextResponse.json(getAvailability(countryCode));
}
