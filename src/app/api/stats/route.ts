import { NextResponse } from "next/server";
import { fetchMatchDetails } from "@/lib/espn";
import { NATIONAL_TEAMS } from "@/lib/players";
import { computeTournamentStats, topPerformers, getStatsScope, WC_START } from "@/lib/aggregator";
import { getCachedFixtures } from "@/lib/fixture-cache";
import { runWithConcurrencyLimit } from "@/lib/utils";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    // During the WC, stats only count world_cup matches (post-June-11). Use
    // WC_START as the floor so the scoreboard window doesn't drag in 30 days
    // of irrelevant qualifier/friendly dates.
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const start = WC_START > thirtyDaysAgo ? WC_START : thirtyDaysAgo;
    const end = new Date(today);

    const fixtures = await getCachedFixtures({ start, end });
    const nationCodes = new Set(NATIONAL_TEAMS.map((t) => t.code));
    const relevant = fixtures.filter(
      (m) => nationCodes.has(m.home.code) || nationCodes.has(m.away.code)
    );

    // Only fetch details for matches that can actually contribute stats:
    // SCHEDULED/TIMED matches have no lineups yet, so skip them entirely.
    const analysable = relevant.filter(
      (m) => m.status === "FINISHED" || m.status === "IN_PLAY" || m.status === "PAUSED"
    );

    // Dedup: skip fetchMatchDetails for matches that already have lineups
    // from the scoreboard endpoint (e.g. FINISHED matches from a previous
    // fetch that were enriched and cached).  Save an HTTP round-trip.
    const needDetails = analysable.filter((m) => !m.lineups);
    const skipDetails = analysable.filter((m) => m.lineups);
    const cached = skipDetails;

    const results = await runWithConcurrencyLimit(needDetails, (m) => fetchMatchDetails(m), 4);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) console.warn(`stats: ${failed}/${results.length} match detail fetches failed`);
    const fresh = results
      .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
      .map((r) => r.value);

    const allDetailed = [...cached, ...fresh];
    const stats = computeTournamentStats(allDetailed);

    return NextResponse.json(
      {
        stats,
        topScorers: topPerformers(stats, "goals", 5),
        topRated: topPerformers(stats, "averageRating", 5),
        matchesAnalysed: allDetailed.filter((m) => m.lineups).length,
        totalFixtures: analysable.length,
        statsScope: getStatsScope(),
      },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } }
    );
  } catch (err) {
    console.error("stats failed", err);
    return NextResponse.json(
      { error: "Failed to compute stats", detail: String(err) },
      { status: 500 }
    );
  }
}
