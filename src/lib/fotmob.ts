import { normaliseName } from "@/lib/players";
import type { LineupPlayer } from "@/types";

const FOTMOB_BASE = "https://www.fotmob.com";

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface Stamped<T> { v: T; exp: number }

const matchIdCache = new Map<string, Stamped<number | null>>();
const ratingsCache = new Map<number, Stamped<Record<string, number> | null>>();
const motmCache = new Map<number, Stamped<{ name: string; teamName: string } | null>>();
const matchDataCache = new Map<number, Stamped<FotmobMatchData | null>>();

function cacheHas<K, V>(map: Map<K, Stamped<V>>, key: K): boolean {
  const e = map.get(key);
  if (!e) return false;
  if (Date.now() > e.exp) { map.delete(key); return false; }
  return true;
}
function cacheGet<K, V>(map: Map<K, Stamped<V>>, key: K): V | undefined {
  return map.get(key)?.v;
}
function cacheSet<K, V>(map: Map<K, Stamped<V>>, key: K, value: V): void {
  map.set(key, { v: value, exp: Date.now() + CACHE_TTL_MS });
}

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
  awayTeamName
    : string
): Promise<number | null> {
  const date = dateISOToYYYYMMDD(dateISO);
  const key = matchCacheKey(date, homeTeamName, awayTeamName);
  if (cacheHas(matchIdCache, key)) return cacheGet(matchIdCache, key) ?? null;

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
            cacheSet(matchIdCache, key, id);
            return id;
          }
        }
      }
    }
    cacheSet(matchIdCache, key, null);
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

export interface FotmobMatchData {
  ratings: Record<string, number> | null;
  motm: { name: string; teamName: string } | null;
  formation: { home: string | null; away: string | null } | null;
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

function extractRatings(content: any): Record<string, number> | null {
  const lineup = content?.lineup;
  if (!lineup) return null;

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

  return result;
}

function extractMotm(content: any): { name: string; teamName: string } | null {
  const potm = content?.matchFacts?.playerOfTheMatch;
  if (!potm) return null;

  let rawName = potm.name;
  // FotMob sometimes returns name as { firstName, lastName, fullName }
  if (typeof rawName === "object" && rawName !== null) {
    rawName = rawName.fullName ?? `${rawName.firstName ?? ""} ${rawName.lastName ?? ""}`.trim();
  }
  if (typeof rawName !== "string" || !rawName) {
    const allPlayers = collectAllLineupPlayers(content?.lineup);
    const matched = allPlayers.find(
      (p: any) => String(p.id) === String(potm.id)
    );
    rawName = matched?.fullName ?? matched?.name ?? "";
  }

  if (!rawName) return null;
  return { name: rawName, teamName: potm.teamName ?? "" };
}

function extractFormation(content: any): { home: string | null; away: string | null } | null {
  const lineup = content?.lineup;
  if (!lineup) return null;

  const homeFormation = lineup.homeTeam?.formation;
  const awayFormation = lineup.awayTeam?.formation;

  if (homeFormation || awayFormation) {
    return {
      home: typeof homeFormation === 'string' ? homeFormation : null,
      away: typeof awayFormation === 'string' ? awayFormation : null,
    };
  }
  return null;
}


export async function fetchFotmobMatchData(
  fotmobMatchId: number
): Promise<FotmobMatchData | null> {
  if (cacheHas(matchDataCache, fotmobMatchId)) {
    return cacheGet(matchDataCache, fotmobMatchId) ?? null;
  }

  try {
    const html = await fetchFotmobPageHtml(fotmobMatchId);
    if (!html) {
      cacheSet(matchDataCache, fotmobMatchId, null);
      cacheSet(ratingsCache, fotmobMatchId, null);
      cacheSet(motmCache, fotmobMatchId, null);
      return null;
    }

    const content = extractFotmobContent(html);
    if (!content) {
      cacheSet(matchDataCache, fotmobMatchId, null);
      cacheSet(ratingsCache, fotmobMatchId, null);
      cacheSet(motmCache, fotmobMatchId, null);
      return null;
    }

    const result = {
      ratings: extractRatings(content),
      motm: extractMotm(content),
      formation: extractFormation(content),
    };
    cacheSet(matchDataCache, fotmobMatchId, result);
    cacheSet(ratingsCache, fotmobMatchId, result.ratings);
    cacheSet(motmCache, fotmobMatchId, result.motm);
    return result;
  } catch {
    cacheSet(matchDataCache, fotmobMatchId, null);
    cacheSet(ratingsCache, fotmobMatchId, null);
    cacheSet(motmCache, fotmobMatchId, null);
    return null;
  }
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
  if (cacheHas(ratingsCache, fotmobMatchId)) {
    return cacheGet(ratingsCache, fotmobMatchId) ?? null;
  }

  const data = await fetchFotmobMatchData(fotmobMatchId);
  return data?.ratings ?? null;
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
  if (cacheHas(motmCache, fotmobMatchId)) {
    return cacheGet(motmCache, fotmobMatchId) ?? null;
  }

  const data = await fetchFotmobMatchData(fotmobMatchId);
  return data?.motm ?? null;
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