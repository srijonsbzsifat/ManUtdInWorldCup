import { NextResponse } from "next/server";
import { getCachedFixtures } from "@/lib/fixture-cache";
import { isOurNationTeam } from "@/lib/players";

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
    const live = fixtures.filter(
      (m) =>
        (m.status === "IN_PLAY" || m.status === "PAUSED") &&
        (isOurNationTeam(m.home) || isOurNationTeam(m.away))
    );

    return NextResponse.json(
      { count: live.length, live, lastUpdated: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=15" } }
    );
  } catch (err) {
    console.error("live failed", err);
    return NextResponse.json(
      { error: "Failed to fetch live matches" },
      { status: 500 }
    );
  }
}
