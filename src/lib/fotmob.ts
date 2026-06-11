import { normaliseName } from "@/lib/players";
import type { LineupPlayer, PlayerPosition } from "@/types";

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

export interface FotmobLineupPlayer {
  id: number;
  name: string;
  positionId?: number;
  usualPlayingPositionId?: number;
  isCaptain?: boolean;
  horizontalLayout?: { x: number; y: number; width?: number; height?: number };
  verticalLayout?: { x: number; y: number; width?: number; height?: number };
  performance?: {
    rating?: number;
  };
}

export interface FotmobMatchData {
  ratings: Record<string, number> | null;
  motm: { name: string; teamName: string } | null;
  formation: { home: string | null; away: string | null } | null;
  lineup: { home: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null; away: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null } | null;
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

export function extractLineup(content: any): { home: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null; away: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null } | null {
  const lineup = content?.lineup;
  if (!lineup) return null;

  const homeTeam = lineup.homeTeam;
  const awayTeam = lineup.awayTeam;

  if (!homeTeam || !awayTeam) return null;

  const result: { home: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null; away: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null } = {
    home: null,
    away: null
  };

  // Extract home team lineup
  if (homeTeam) {
    const homeStarters = Array.isArray(homeTeam.starters) ? homeTeam.starters : [];
    const homeSubs = Array.isArray(homeTeam.subs) ? homeTeam.subs : [];

    result.home = {
      starters: homeStarters.map((p: any) => ({
        id: p.id ?? 0,
        name: p.name ?? '',
        positionId: p.positionId,
        usualPlayingPositionId: p.usualPlayingPositionId,
        isCaptain: p.isCaptain === true,
        horizontalLayout: p.horizontalLayout ? {
          x: p.horizontalLayout.x,
          y: p.horizontalLayout.y,
          width: p.horizontalLayout.width,
          height: p.horizontalLayout.height
        } : undefined,
        verticalLayout: p.verticalLayout ? {
          x: p.verticalLayout.x,
          y: p.verticalLayout.y,
          width: p.verticalLayout.width,
          height: p.verticalLayout.height
        } : undefined,
        performance: p.performance ? {
          rating: p.performance?.rating ?? null
        } : undefined
      })),
      subs: homeSubs.map((p: any) => ({
        id: p.id ?? 0,
        name: p.name ?? '',
        positionId: p.positionId,
        usualPlayingPositionId: p.usualPlayingPositionId,
        isCaptain: p.isCaptain === true,
        performance: p.performance ? {
          rating: p.performance?.rating ?? null
        } : undefined
      }))
    };
  }

  // Extract away team lineup
  if (awayTeam) {
    const awayStarters = Array.isArray(awayTeam.starters) ? awayTeam.starters : [];
    const awaySubs = Array.isArray(awayTeam.subs) ? awayTeam.subs : [];

    result.away = {
      starters: awayStarters.map((p: any) => ({
        id: p.id ?? 0,
        name: p.name ?? '',
        positionId: p.positionId,
        usualPlayingPositionId: p.usualPlayingPositionId,
        isCaptain: p.isCaptain === true,
        horizontalLayout: p.horizontalLayout ? {
          x: p.horizontalLayout.x,
          y: p.horizontalLayout.y,
          width: p.horizontalLayout.width,
          height: p.horizontalLayout.height
        } : undefined,
        verticalLayout: p.verticalLayout ? {
          x: p.verticalLayout.x,
          y: p.verticalLayout.y,
          width: p.verticalLayout.width,
          height: p.verticalLayout.height
        } : undefined,
        performance: p.performance ? {
          rating: p.performance?.rating ?? null
        } : undefined
      })),
      subs: awaySubs.map((p: any) => ({
        id: p.id ?? 0,
        name: p.name ?? '',
        positionId: p.positionId,
        usualPlayingPositionId: p.usualPlayingPositionId,
        isCaptain: p.isCaptain === true,
        performance: p.performance ? {
          rating: p.performance?.rating ?? null
        } : undefined
      }))
    };
  }

  return result;
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

    const lineupExtracted = extractLineup(content);
    const formationExtracted = extractFormation(content);

    // Dump raw FotMob content to see player object structure
    try {
      const rawLineup = content?.lineup;
      if (rawLineup?.homeTeam?.starters?.[0]) {
        const s0 = rawLineup.homeTeam.starters[0];
        console.log("[FOTMOB] RAW FotMob home starter[0] ALL keys:", Object.keys(s0));
        console.log("[FOTMOB] RAW FotMob home starter[0] full:", JSON.stringify(s0, null, 2));
        // Check 3 starters for any position-like field
        for (let i = 0; i < Math.min(3, rawLineup.homeTeam.starters.length); i++) {
          const s = rawLineup.homeTeam.starters[i];
          console.log("[FOTMOB] RAW starter[" + i + "]: name=" + s.name, "position=" + s.position, "role=" + s.role, "type=" + s.type, "pos=" + s.pos,
            "has position field:", "position" in s,
            "all fields:", Object.keys(s).join(","));
        }
      }
    } catch (e) {
      console.log("[FOTMOB] RAW dump error:", e);
    }

    console.log("[FOTMOB] fetchFotmobMatchData id=" + fotmobMatchId, {
      hasRatings: !!extractRatings(content),
      hasMotm: !!extractMotm(content),
      hasFormation: !!formationExtracted,
      formation: formationExtracted,
      hasLineup: !!lineupExtracted,
      lineupStats: lineupExtracted ? {
        homeStarters: lineupExtracted.home?.starters?.length ?? 0,
        homeSubs: lineupExtracted.home?.subs?.length ?? 0,
        awayStarters: lineupExtracted.away?.starters?.length ?? 0,
        awaySubs: lineupExtracted.away?.subs?.length ?? 0,
        homeSamplePos: lineupExtracted.home?.starters?.slice(0, 3).map((p: any) => p.position),
        awaySamplePos: lineupExtracted.away?.starters?.slice(0, 3).map((p: any) => p.position),
      } : null,
    });

    const result = {
      ratings: extractRatings(content),
      motm: extractMotm(content),
      formation: formationExtracted,
      lineup: lineupExtracted,
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
/* Position mapping from FotMob to our PlayerPosition type                     */
/* -------------------------------------------------------------------------- */

export function mapFotmobPosition(pos: string | null | undefined): PlayerPosition {
  if (!pos) return "MF";
  const p = pos.toUpperCase().trim();
  if (p === "G") return "GK";
  if (p === "D") return "DF";
  if (p === "M") return "MF";
  if (p === "F") return "FW";
  if (p === "GOALKEEPER") return "GK";
  if (p === "DEFENDER" || p === "DEFENDERS") return "DF";
  if (p === "MIDFIELDER" || p === "MIDFIELDERS") return "MF";
  if (p === "FORWARD" || p === "FORWARDS") return "FW";
  const map: Record<string, PlayerPosition> = {
    GK: "GK", CB: "CB", LB: "LB", RB: "RB", LCB: "CB", RCB: "CB",
    LWB: "LB", RWB: "RB", WB: "DF",
    DM: "DM", CDM: "DM", CM: "CM", LCM: "CM", RCM: "CM",
    LM: "LM", RM: "RM",
    AM: "AM", CAM: "AM", LAM: "AM", RAM: "AM",
    LW: "LW", RW: "RW",
    CF: "CF", ST: "ST", SS: "CF",
    MF: "MF", FW: "FW", DF: "DF",
  };
  return map[p] ?? "MF";
}

/**
 * Check if a PlayerPosition is specific enough to determine its category
 * (DEF / MID / WF / FW) without formation context.
 */
function isSpecificPosition(pos: PlayerPosition): boolean {
  return !(["MF", "DF", "FW"] as PlayerPosition[]).includes(pos);
}

/**
 * Given the formation string, compute how many of each PitchView category
 * the formation needs.  Returns { DEF, MID, WF, FW } counts.
 */
function formationCategoryCounts(formation: string): { DEF: number; MID: number; WF: number; FW: number } | null {
  const parts = formation.split("-").map(Number);
  if (parts.some(isNaN) || parts.length === 0 || parts.reduce((a, b) => a + b, 0) + 1 !== 11) return null;
  // Map each formation line to a PitchView category
  const lineCategories: ("DEF" | "MID" | "WF" | "FW")[] = [];
  for (let lineIdx = 0; lineIdx < parts.length; lineIdx++) {
    const isBackLine = lineIdx === 0;
    const isForwardLine = lineIdx === parts.length - 1;
    if (isBackLine) lineCategories.push("DEF");
    else if (isForwardLine) {
      const count = parts[lineIdx];
      if (count === 1) lineCategories.push("FW");
      else if (count === 2) { lineCategories.push("FW"); lineCategories.push("FW"); }
      else if (count === 3) { lineCategories.push("WF"); lineCategories.push("FW"); lineCategories.push("WF"); }
      else { for (let i = 0; i < count; i++) lineCategories.push("FW"); }
    } else {
      lineCategories.push("MID");
    }
  }
  // Expand to individual positions
  const individualCategories: ("DEF" | "MID" | "WF" | "FW")[] = [];
  for (let lineIdx = 0; lineIdx < parts.length; lineIdx++) {
    const cat = lineCategories[lineIdx];
    for (let i = 0; i < parts[lineIdx]; i++) {
      // For a 3-player forward line: LW, ST, RW → WF, FW, WF
      if (lineIdx === parts.length - 1 && parts[lineIdx] === 3) {
        if (i === 0) individualCategories.push("WF");
        else if (i === parts[lineIdx] - 1) individualCategories.push("WF");
        else individualCategories.push("FW");
      } else if (lineIdx === parts.length - 1 && parts[lineIdx] === 2) {
        individualCategories.push("FW");
        individualCategories.push("FW");
      } else {
        individualCategories.push(cat);
      }
    }
  }
  const counts = { DEF: 0, MID: 0, WF: 0, FW: 0 };
  for (const c of individualCategories) counts[c]++;
  return counts;
}

function positionCategory(pos: PlayerPosition): "GK" | "DEF" | "MID" | "WF" | "FW" {
  const p = pos.toUpperCase();
  if (p === "GK") return "GK";
  if (["LB", "CB", "RB", "DF"].includes(p)) return "DEF";
  if (["DM", "CM", "AM"].includes(p)) return "MID";
  if (["LW", "RW"].includes(p)) return "WF";
  if (["ST", "CF"].includes(p)) return "FW";
  return "MID"; // MF falls here
}

/**
 * Derive a specific player position from FotMob's formation-slot positionId and
 * the verticalLayout.x coordinate (0 = team's right touchline, 1 = team's left).
 *
 * FotMob uses a slot-based positionId scheme per formation line:
 *   11        → GK
 *   30–45     → 4-player defensive line (x < 0.25 → RB; x > 0.75 → LB; else CB)
 *   60–70     → 2-player DM line
 *   71–80     → 3-player CM line (x < 0.33 → RM; x > 0.67 → LM; else CM)
 *   81–90     → 3-player AM line (x < 0.33 → RM; x > 0.67 → LM; else AM)
 *   100–110   → 3-player forward line (x < 0.33 → RW; x > 0.67 → LW; else ST)
 *   ≥111      → lone striker
 */
function getFotmobPosition(positionId: number | undefined, verticalX: number): PlayerPosition | null {
  if (!positionId) return null;

  if (positionId === 11) return "GK";

  if (positionId >= 30 && positionId <= 45) {
    if (verticalX < 0.25) return "RB";
    if (verticalX > 0.75) return "LB";
    return "CB";
  }

  if (positionId >= 60 && positionId <= 70) return "DM";

  if (positionId >= 71 && positionId <= 80) {
    if (verticalX < 0.33) return "RM";
    if (verticalX > 0.67) return "LM";
    return "CM";
  }

  if (positionId >= 81 && positionId <= 90) {
    if (verticalX < 0.33) return "RM";
    if (verticalX > 0.67) return "LM";
    return "AM";
  }

  if (positionId >= 100 && positionId <= 110) {
    if (verticalX < 0.33) return "RW";
    if (verticalX > 0.67) return "LW";
    return "ST";
  }

  if (positionId >= 111) return "ST";

  return null;
}

/**
 * Override positions in an ESPN LineupPlayer[] using formation-based inference.
 *
 * Strategy:
 *   1. Keep positions that are already category-specific (GK, LB, CB, RB,
 *      DM, CM, AM, LW, RW, ST, CF).
 *   2. For starters whose position is generic ("MF", "DF", "FW"), infer
 *      the correct category from the formation: count how many of each
 *      category we already have, calculate the gap from the formation
 *      requirement, and assign generic players to fill gaps in priority
 *      order (DEF → MID → WF → FW).
 *   3. For subs, keep ESPN original (we can't infer from formation).
 */
export function applyFotmobPositions(
  espnLineup: LineupPlayer[],
  fotmobLineup: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null | undefined,
  formation?: string | null
): LineupPlayer[] {
  console.log("[FOTMOB] applyFotmobPositions called, formation:", formation);

  const lineupForStats = espnLineup;

  // Use positionId + verticalLayout.x for starters; usualPlayingPositionId for subs
  if (fotmobLineup?.starters) {
    const startersMap = new Map(
      fotmobLineup.starters.map((p) => [normaliseName(p.name), p])
    );
    const subsMap = new Map(
      (fotmobLineup.subs ?? []).map((p) => [normaliseName(p.name), p])
    );
    // usualPlayingPositionId: 0=GK 1=DEF 2=MID 3=FW
    const usualPosMap: Record<number, PlayerPosition> = { 0: 'GK', 1: 'DF', 2: 'MF', 3: 'FW' };

    const result = espnLineup.map((p) => {
      if (p.starter) {
        const fm = startersMap.get(normaliseName(p.name));
        if (fm) {
          const verticalX = fm.verticalLayout?.x ?? 0.5;
          const finalPos = getFotmobPosition(fm.positionId, verticalX) ?? p.position;
          console.log(`[FOTMOB] mapping for ${p.name}: ${p.position} → ${finalPos} (positionId=${fm.positionId}, verticalX=${verticalX}, captain=${fm.isCaptain})`);
          return { ...p, position: finalPos, captain: fm.isCaptain === true || p.captain };
        }
      } else {
        // Sub: derive broad position from FotMob's usualPlayingPositionId; also apply captain
        const fm = subsMap.get(normaliseName(p.name));
        if (fm) {
          const captain = fm.isCaptain === true || p.captain;
          if (fm.usualPlayingPositionId !== undefined && fm.usualPlayingPositionId !== null) {
            const mappedPos = usualPosMap[fm.usualPlayingPositionId];
            if (mappedPos) return { ...p, position: mappedPos, captain };
          }
          if (captain) return { ...p, captain };
        }
      }
      return p;
    });
    if (!formation) return result;
    return applyFormationRefinement(result, formation);
  }

  // Only process starters with formation context
  if (!formation) {
    console.log("[FOTMOB] no formation, skipping position override");
    return espnLineup;
  }
  return applyFormationRefinement(espnLineup, formation);
}

function applyFormationRefinement(
  espnLineup: LineupPlayer[],
  formation: string
): LineupPlayer[] {
  const catCounts = formationCategoryCounts(formation);
  if (!catCounts) {
    console.log("[FOTMOB] unknown formation:", formation);
    return espnLineup;
  }

  const lineupForStats = espnLineup;

  console.log("[FOTMOB] formation", formation, "needs:", catCounts);

  // Count specific positions per category among starters
  const starters = espnLineup.filter(p => p.starter);
  const subs = espnLineup.filter(p => !p.starter);

  const specCounts = { DEF: 0, MID: 0, WF: 0, FW: 0 };
  const genericMf: LineupPlayer[] = []; // players with "MF" position
  const genericFw: LineupPlayer[] = []; // players with "FW" position

  for (const p of starters) {
    if (isSpecificPosition(p.position)) {
      const cat = positionCategory(p.position);
      if (cat !== "GK") specCounts[cat]++;
    } else if (p.position === "MF") {
      genericMf.push(p);
    } else if (p.position === "FW") {
      genericFw.push(p);
    } else if (p.position === "DF") {
      specCounts.DEF++;
    }
  }

  console.log("[FOTMOB] specific position counts:", specCounts,
    "generic MF:", genericMf.length, "generic FW:", genericFw.length);

  // Calculate gaps
  const gaps = {
    DEF: Math.max(0, catCounts.DEF - specCounts.DEF),
    MID: Math.max(0, catCounts.MID - specCounts.MID),
    WF: Math.max(0, catCounts.WF - specCounts.WF),
    FW: Math.max(0, catCounts.FW - specCounts.FW),
  };

  console.log("[FOTMOB] category gaps:", gaps);

  // Priority order for assigning "MF" players: fill DEF first, then MID, then WF
  const fillOrder: ("DEF" | "MID" | "WF" | "FW")[] = ["DEF", "MID", "WF", "FW"];
  const mfAssignments = new Map<string, PlayerPosition>();
  let mfIdx = 0;

  for (const cat of fillOrder) {
    let needed = gaps[cat];
    while (needed > 0 && mfIdx < genericMf.length) {
      const targetPos: PlayerPosition = cat === "DEF" ? "DF" : cat === "MID" ? "MF" : cat === "WF" ? "LW" : "FW";
      mfAssignments.set(normaliseName(genericMf[mfIdx].name), targetPos);
      console.log("[FOTMOB] assign MF:", genericMf[mfIdx].name, "→", targetPos, "(fills", cat, "gap)");
      mfIdx++;
      needed--;
    }
  }

  // Any remaining MF players → default to MID
  while (mfIdx < genericMf.length) {
    mfAssignments.set(normaliseName(genericMf[mfIdx].name), "CM");
    console.log("[FOTMOB] assign remaining MF:", genericMf[mfIdx].name, "→ CM (overflow)");
    mfIdx++;
  }

  // Assign "FW" players: fill FW gap first, then WF
  const fwAssignments = new Map<string, PlayerPosition>();
  let fwGapNeeded = gaps.FW;
  for (const p of genericFw) {
    if (fwGapNeeded > 0) {
      fwAssignments.set(normaliseName(p.name), "ST");
      console.log("[FOTMOB] assign FW:", p.name, "→ ST (fills FW gap)");
      fwGapNeeded--;
    } else {
      fwAssignments.set(normaliseName(p.name), "LW");
      console.log("[FOTMOB] assign FW:", p.name, "→ LW (WF overflow)");
    }
  }

  // Apply assignments
  let applied = 0;
  const result = espnLineup.map((p) => {
    const key = normaliseName(p.name);
    const mfPos = mfAssignments.get(key);
    if (mfPos && p.starter) {
      applied++;
      return { ...p, position: mfPos };
    }
    const fwPos = fwAssignments.get(key);
    if (fwPos && p.starter) {
      applied++;
      return { ...p, position: fwPos };
    }
    return p;
  });

  const changed = result.filter((p, i) => p.position !== lineupForStats[i]?.position);
  console.log("[FOTMOB] applied to", applied, "players");
  if (changed.length > 0) {
    console.log("[FOTMOB] changes:",
      changed.map(p => p.name + ": " + (espnLineup.find(e => e.id === p.id)?.position ?? "?") + "->" + p.position).join(", ")
    );
  }

  return result;
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