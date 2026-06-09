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
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);

    const fixtures = await getCachedFixtures({ start, end });
    const nationCodes = new Set(NATIONAL_TEAMS.map((t) => t.code));
    const relevant = fixtures.filter(
      (m) => nationCodes.has(m.home.code) || nationCodes.has(m.away.code)
    );
    const results = await Promise.allSettled(relevant.map((m) => fetchMatchDetails(m)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) console.warn(`stats: ${failed}/${results.length} match detail fetches failed`);
    const detailed = results
      .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
      .map((r) => r.value);
    const stats = computeTournamentStats(detailed);

    return NextResponse.json({
      stats,
      topScorers: topPerformers(stats, "goals", 5),
      topRated: topPerformers(stats, "averageRating", 5),
      matchesAnalysed: detailed.filter((m) => m.lineups).length,
      totalFixtures: relevant.length,
    });
  } catch (err) {
    console.error("stats failed", err);
    return NextResponse.json(
      { error: "Failed to compute stats", detail: String(err) },
      { status: 500 }
    );
  }
}
