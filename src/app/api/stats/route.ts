import { NextResponse } from "next/server";
import { fetchMatchDetails } from "@/lib/espn";
import { NATIONAL_TEAMS } from "@/lib/players";
import { computeTournamentStats, topPerformers } from "@/lib/aggregator";
import { getCachedFixtures } from "@/lib/fixture-cache";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function GET() {
  try {
    const today = new Date();
    // Only past matches contribute stats — no need to fetch future fixtures.
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
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

    const results = await Promise.allSettled(needDetails.map((m) => fetchMatchDetails(m)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) console.warn(`stats: ${failed}/${results.length} match detail fetches failed`);
    const fresh = results
      .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
      .map((r) => r.value);

    const allDetailed = [...cached, ...fresh];
    const stats = computeTournamentStats(allDetailed);

    return NextResponse.json({
      stats,
      topScorers: topPerformers(stats, "goals", 5),
      topRated: topPerformers(stats, "averageRating", 5),
      matchesAnalysed: allDetailed.filter((m) => m.lineups).length,
      totalFixtures: analysable.length,
      // Log how many HTTP calls we saved for debugging
      _detailCallSavings: skipDetails.length,
    });
  } catch (err) {
    console.error("stats failed", err);
    return NextResponse.json(
      { error: "Failed to compute stats", detail: String(err) },
      { status: 500 }
    );
  }
}
