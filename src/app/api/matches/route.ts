import { NextResponse } from "next/server";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";
import { NATIONAL_TEAMS } from "@/lib/players";
import type { Match } from "@/types";

export const revalidate = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const withDetails = url.searchParams.get("details") === "1";
  const nation = url.searchParams.get("nation") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined; // live|upcoming|finished
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const MAX_DATE = new Date("2026-07-30T23:59:59Z");

  const start = startParam
    ? new Date(startParam)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
      })();
  const end = endParam
    ? new Date(endParam)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 60);
        return d > MAX_DATE ? MAX_DATE : d;
      })();

  try {
    let matches = await fetchAllFixtures({ dateRange: { start, end } });

    // Filter to only matches involving one of our nations.
    const nationCodes = new Set(NATIONAL_TEAMS.map((t) => t.code));
    matches = matches.filter(
      (m) => nationCodes.has(m.home.code) || nationCodes.has(m.away.code)
    );

    if (nation) {
      const code = nation.toUpperCase();
      matches = matches.filter(
        (m) => m.home.code === code || m.away.code === code
      );
    }

    if (status === "live") {
      matches = matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    } else if (status === "upcoming") {
      matches = matches.filter((m) => m.status === "SCHEDULED" || m.status === "TIMED");
    } else if (status === "finished") {
      matches = matches.filter((m) => m.status === "FINISHED");
    }

    if (withDetails) {
      const results = await Promise.allSettled(matches.map((m) => fetchMatchDetails(m)));
      matches = results
        .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
        .map((r) => r.value);
    }

    return NextResponse.json({
      count: matches.length,
      start: start.toISOString(),
      end: end.toISOString(),
      matches,
    });
  } catch (err) {
    console.error("matches fetch failed", err);
    return NextResponse.json(
      { error: "Failed to fetch matches", detail: String(err) },
      { status: 500 }
    );
  }
}
