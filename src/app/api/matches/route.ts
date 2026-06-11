import { NextResponse } from "next/server";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";
import { NATIONAL_TEAMS } from "@/lib/players";
import type { Match } from "@/types";

export const revalidate = 15;

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

    const totalCount = matches.length;

    if (withDetails) {
      const results = await Promise.allSettled(matches.map((m) => fetchMatchDetails(m)));
      matches = results
        .filter((r): r is PromiseFulfilledResult<Match> => r.status === "fulfilled")
        .map((r) => r.value);
    }

    if (limit !== undefined) {
      matches = matches.slice(0, limit);
    }

    return NextResponse.json({
      count: totalCount,
      limit: limit ?? totalCount,
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