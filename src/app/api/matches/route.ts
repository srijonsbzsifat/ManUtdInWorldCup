import { NextResponse } from "next/server";
import { fetchMatchDetails } from "@/lib/espn";
import { getCachedFixtures } from "@/lib/fixture-cache";
import { runWithConcurrencyLimit } from "@/lib/utils";
import { NATIONAL_TEAMS, isOurNationTeam, findNationForTeam } from "@/lib/players";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["live", "upcoming", "finished"] as const;
const MAX_DATE = new Date("2026-07-30T23:59:59Z");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const withDetails = url.searchParams.get("details") === "1";
  const nation = url.searchParams.get("nation") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const limitParam = url.searchParams.get("limit");

  // --- Validate limit ---
  let limit: number | undefined;
  if (limitParam !== null) {
    limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: `Invalid limit: "${limitParam}". Must be a positive integer.` },
        { status: 400 }
      );
    }
  }

  // --- Validate status ---
  if (status !== undefined && !VALID_STATUSES.includes(status as any)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // --- Validate nation ---
  if (nation !== undefined) {
    const validNation = NATIONAL_TEAMS.some(
      (t) => t.id === nation || t.code === nation.toUpperCase()
    );
    if (!validNation) {
      return NextResponse.json(
        { error: "Invalid nation parameter. Must be a valid national team ID or code." },
        { status: 400 }
      );
    }
  }

  // --- Validate start / end ---
  let start: Date;
  let end: Date;

  if (startParam) {
    start = new Date(startParam);
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        { error: `Invalid start date: "${startParam}". Use ISO 8601 format (e.g. 2026-06-01).` },
        { status: 400 }
      );
    }
  } else {
    start = new Date();
    start.setDate(start.getDate() - 30);
  }

  if (endParam) {
    end = new Date(endParam);
    if (isNaN(end.getTime())) {
      return NextResponse.json(
        { error: `Invalid end date: "${endParam}". Use ISO 8601 format (e.g. 2026-07-01).` },
        { status: 400 }
      );
    }
  } else {
    // For upcoming matches, use a shorter window (30 days instead of 60).
    if (status === "upcoming") {
      end = new Date();
      end.setDate(end.getDate() + 30);
    } else {
      end = new Date();
      end.setDate(end.getDate() + 60);
    }
    if (end > MAX_DATE) end = MAX_DATE;
  }

  if (start > end) {
    return NextResponse.json(
      { error: "start date must be before or equal to end date." },
      { status: 400 }
    );
  }

  try {
    let matches = await getCachedFixtures({ start, end });

    // Filter to only matches involving one of our nations (by ESPN code, with a
    // name-based fallback so a single abbreviation drift can't hide fixtures).
    matches = matches.filter(
      (m) => isOurNationTeam(m.home) || isOurNationTeam(m.away)
    );

    if (nation) {
      // Resolve the requested nation param (id or code) to its canonical code,
      // then compare via the same fallback-aware matcher.
      const requested = NATIONAL_TEAMS.find(
        (t) => t.id === nation || t.code === nation.toUpperCase()
      );
      if (requested) {
        matches = matches.filter(
          (m) =>
            findNationForTeam(m.home)?.code === requested.code ||
            findNationForTeam(m.away)?.code === requested.code
        );
      }
    }

    if (status === "live") {
      matches = matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    } else if (status === "upcoming") {
      matches = matches.filter((m) => m.status === "SCHEDULED");
    } else if (status === "finished") {
      matches = matches.filter((m) => m.status === "FINISHED");
    }

    const totalCount = matches.length;

    // Slice to limit BEFORE fetching details to avoid fan-out over matches we'll discard.
    if (limit !== undefined) {
      matches = matches.slice(0, limit);
    }

    if (withDetails) {
      const results = await runWithConcurrencyLimit(matches, (m) => fetchMatchDetails(m), 4);
      matches = results
        .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
        .map((r) => r.value);
    }

    return NextResponse.json(
      {
        count: totalCount,
        limit: limit ?? totalCount,
        start: start.toISOString(),
        end: end.toISOString(),
        matches,
      },
      { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=15" } }
    );
  } catch (err) {
    console.error("matches fetch failed", err);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}