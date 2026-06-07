import { NextResponse } from "next/server";
import { apiFootballEnabled } from "@/lib/apiFootball";
import { COMPETITION_SLUGS } from "@/lib/espn";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export async function GET() {
  return NextResponse.json({
    primary: {
      name: "espn",
      available: true,
      competitions: COMPETITION_SLUGS.map((c) => c.name),
    },
    premium: {
      name: "api-football",
      available: apiFootballEnabled(),
      reason: apiFootballEnabled()
        ? "API_FOOTBALL_KEY detected"
        : "Set API_FOOTBALL_KEY in your environment to enable premium stats and player ratings.",
    },
  });
}
