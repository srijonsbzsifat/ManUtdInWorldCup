import { NextResponse } from "next/server";
import { getCachedFixtures } from "@/lib/fixture-cache";
import { fetchMatchDetails } from "@/lib/espn";
import { runWithConcurrencyLimit } from "@/lib/utils";
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

    // Enrich the (few) in-play matches with lineups/ratings/events so the live
    // cards can show which United players are on the pitch and their live
    // ratings. Concurrency-limited; fall back to the scoreboard match on failure
    // so a card never disappears. fetchMatchDetails bypasses the FotMob cache for
    // live matches, so ratings refresh as the game progresses.
    const results = await runWithConcurrencyLimit(live, (m) => fetchMatchDetails(m), 4);
    const enriched = results.map((r, i) => (r.status === "fulfilled" ? r.value : live[i]));

    return NextResponse.json(
      { count: enriched.length, live: enriched, lastUpdated: new Date().toISOString() },
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
