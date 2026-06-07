import { normaliseName } from "@/lib/players";
import type { LineupPlayer } from "@/types";

const FOTMOB_BASE = "https://www.fotmob.com";

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

const matchIdCache = new Map<string, number | null>();
const ratingsCache = new Map<number, Record<string, number> | null>();
const motmCache = new Map<number, { name: string; teamName: string } | null>();

function matchCacheKey(date: string, home: string, away: string): string {
  return `${date}|${normaliseName(home)}|${normaliseName(away)}`;
}

/* -------------------------------------------------------------------------- */
/* Match ID lookup                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Find a FotMob match ID by date and team names.  Uses the
 * /api/data/matches?date=YYYYMMDD endpoint (which still works without
 * Cloudflare verification).
 */
export async function fetchFotmobMatchId(
  dateISO: string,
  homeTeamName: string,
  awayTeamName: string
): Promise<number | null> {
  const date = dateISOToYYYYMMDD(dateISO);
  const key = matchCacheKey(date, homeTeamName, awayTeamName);
  if (matchIdCache.has(key)) return matchIdCache.get(key) ?? null;

  try {
    const url = `${FOTMOB_BASE}/api/data/matches?date=${date}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const body: any = await res.json();
    const leagues: any[] = body?.leagues ?? [];
    const homeNorm = normaliseName(homeTeamName);
    const awayNorm = normaliseName(awayTeamName);

    for (const league of leagues) {
      const matches: any[] = league?.matches ?? [];
      if (!Array.isArray(matches)) continue;
      for (const m of matches) {
        if (!m?.home?.name || !m?.away?.name) continue;
        const fotmobHome = normaliseName(m.home.name);
        const fotmobAway = normaliseName(m.away.name);
        if (fotmobHome === homeNorm && fotmobAway === awayNorm) {
          const id = parseInt(m.id, 10);
          if (!isNaN(id)) {
            matchIdCache.set(key, id);
            return id;
          }
        }
      }
    }
    matchIdCache.set(key, null);
    return null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Ratings scraper                                                            */
/* -------------------------------------------------------------------------- */

interface FotmobLineupPlayer {
  id: number;
  name: string;
  performance?: {
    rating?: number;
  };
}

/**
 * Shared helpers for fetching FotMob match page and extracting __NEXT_DATA__.
 */

async function fetchFotmobPageHtml(
  fotmobMatchId: number
): Promise<string | null> {
  const url = `${FOTMOB_BASE}/match/${fotmobMatchId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  return await res.text();
}

function extractFotmobContent(html: string): any | null {
  const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/);
  if (!nextDataMatch) return null;
  try {
    const parsed = JSON.parse(nextDataMatch[1]);
    return parsed?.props?.pageProps?.content ?? null;
  } catch {
    return null;
  }
}

function collectAllLineupPlayers(lineup: any): any[] {
  if (!lineup) return [];
  const all: any[] = [];
  for (const side of ["homeTeam", "awayTeam"]) {
    const s = lineup[side];
    if (s) {
      if (Array.isArray(s.starters)) all.push(...s.starters);
      if (Array.isArray(s.subs)) all.push(...s.subs);
    }
  }
  return all;
}

/**
 * Fetch FotMob match page HTML, extract __NEXT_DATA__, and return a map of
 * player name → rating for all players who appeared in the match.
 *
 * The match page URL format is /matches/<slug>/<hash>.  /match/<id> redirects
 * there (308), which Node's fetch follows automatically.
 */
export async function fetchFotmobLineupRatings(
  fotmobMatchId: number
): Promise<Record<string, number> | null> {
  if (ratingsCache.has(fotmobMatchId)) {
    return ratingsCache.get(fotmobMatchId) ?? null;
  }

  try {
    const html = await fetchFotmobPageHtml(fotmobMatchId);
    if (!html) {
      ratingsCache.set(fotmobMatchId, null);
      return null;
    }

    const content = extractFotmobContent(html);
    if (!content) {
      ratingsCache.set(fotmobMatchId, null);
      return null;
    }

    const lineup = content?.lineup;
    if (!lineup) {
      ratingsCache.set(fotmobMatchId, null);
      return null;
    }

    const result: Record<string, number> = {};

    function collect(players: FotmobLineupPlayer[]) {
      if (!Array.isArray(players)) return;
      for (const p of players) {
        const rating = p?.performance?.rating;
        if (rating !== undefined && rating !== null && p?.name) {
          result[normaliseName(p.name)] = rating;
        }
      }
    }

    collect(lineup?.homeTeam?.starters);
    collect(lineup?.homeTeam?.subs);
    collect(lineup?.awayTeam?.starters);
    collect(lineup?.awayTeam?.subs);

    ratingsCache.set(fotmobMatchId, result);
    return result;
  } catch {
    ratingsCache.set(fotmobMatchId, null);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* MOTM scraper                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fetch FotMob MOTM info from the match page's __NEXT_DATA__.
 * Returns the MOTM name and team name, or null.
 */
export async function fetchFotmobMotm(
  fotmobMatchId: number
): Promise<{ name: string; teamName: string } | null> {
  if (motmCache.has(fotmobMatchId)) {
    return motmCache.get(fotmobMatchId) ?? null;
  }

  try {
    const html = await fetchFotmobPageHtml(fotmobMatchId);
    if (!html) {
      motmCache.set(fotmobMatchId, null);
      return null;
    }

    const content = extractFotmobContent(html);
    if (!content) {
      motmCache.set(fotmobMatchId, null);
      return null;
    }

    const potm = content?.matchFacts?.playerOfTheMatch;
    if (!potm) {
      motmCache.set(fotmobMatchId, null);
      return null;
    }

    let rawName = potm.name;
    // FotMob sometimes returns name as { firstName, lastName, fullName }
    if (typeof rawName === "object" && rawName !== null) {
      rawName = rawName.fullName ?? `${rawName.firstName ?? ""} ${rawName.lastName ?? ""}`.trim();
    }
    if (typeof rawName !== "string" || !rawName) {
      // Fall back to looking up player name from lineup by player id
      const allPlayers = collectAllLineupPlayers(content?.lineup);
      const matched = allPlayers.find(
        (p: any) => String(p.id) === String(potm.id)
      );
      rawName = matched?.fullName ?? matched?.name ?? "";
    }

    if (!rawName) {
      motmCache.set(fotmobMatchId, null);
      return null;
    }

    const result = { name: rawName, teamName: potm.teamName ?? "" };
    motmCache.set(fotmobMatchId, result);
    return result;
  } catch {
    motmCache.set(fotmobMatchId, null);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Apply FotMob ratings to an ESPN lineup                                     */
/* -------------------------------------------------------------------------- */

/**
 * Override rating values in a LineupPlayer array with values from FotMob,
 * matched by normalised player name.
 */
export function applyFotmobRatings(
  lineup: LineupPlayer[],
  fotmobRatings: Record<string, number>
): LineupPlayer[] {
  if (!fotmobRatings || Object.keys(fotmobRatings).length === 0) return lineup;
  return lineup.map((p) => {
    const key = normaliseName(p.name);
    const fmRating = fotmobRatings[key];
    if (fmRating !== undefined && fmRating !== null) {
      return { ...p, rating: fmRating };
    }
    return p;
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function dateISOToYYYYMMDD(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
