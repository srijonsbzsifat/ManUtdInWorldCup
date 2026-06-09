import { NextResponse } from "next/server";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";
import { NATIONAL_TEAMS } from "@/lib/players";
import { computeTournamentStats, topPerformers } from "@/lib/aggregator";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const FIXTURE_CACHE_TTL_MS = 5 * 60 * 1000;
let fixtureCache:
  | { key: string; expiresAt: number; fixtures: Match[] }
  | null = null;

async function getCachedFixtures(dateRange: { start: Date; end: Date }) {
  const key = `${dateRange.start.toISOString().slice(0, 10)}|${dateRange.end.toISOString().slice(0, 10)}`;
  if (fixtureCache && fixtureCache.key === key && Date.now() < fixtureCache.expiresAt) {
    return fixtureCache.fixtures;
  }

  const fixtures = await fetchAllFixtures({ dateRange });
  fixtureCache = {
    key,
    expiresAt: Date.now() + FIXTURE_CACHE_TTL_MS,
    fixtures,
  };
  return fixtures;
}

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
