import { NextResponse } from "next/server";
import { getCachedFixtures } from "@/lib/fixture-cache";
import { NATIONAL_TEAMS } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 1);

    // Short 15s TTL — live match state changes frequently.
    const fixtures = await getCachedFixtures({ start, end }, 15_000);
    const nationCodes = new Set(NATIONAL_TEAMS.map((t) => t.code));
    const live = fixtures.filter(
      (m) =>
        (m.status === "IN_PLAY" || m.status === "PAUSED") &&
        (nationCodes.has(m.home.code) || nationCodes.has(m.away.code))
    );

    return NextResponse.json(
      { count: live.length, live, lastUpdated: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=15" } }
    );
  } catch (err) {
    console.error("live failed", err);
    return NextResponse.json(
      { error: "Failed to fetch live matches", detail: String(err) },
      { status: 500 }
    );
  }
}
