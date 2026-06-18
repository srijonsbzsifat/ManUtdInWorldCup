import { normaliseName, matchUnitedPlayer } from "@/lib/players";
import type { LineupPlayer, PlayerPosition } from "@/types";

const FOTMOB_BASE = "https://www.fotmob.com";

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

// Finished match data (ratings, lineups) never changes after the match ends.
// Use a 24-hour TTL so users revisiting a match within a day don't re-fetch.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 200; // per-map max entries to prevent memory leaks

interface Stamped<T> { v: T; exp: number }

const matchIdCache = new Map<string, Stamped<number | null>>();
const ratingsCache = new Map<number, Stamped<Record<string, number> | null>>();
const motmCache = new Map<number, Stamped<{ name: string; teamName: string } | null>>();
const matchDataCache = new Map<number, Stamped<FotmobMatchData | null>>();

/** In-memory cache keyed by YYYYMMDD → parsed FotMob matches[] for that date.
 *  Multiple match ID lookups on the same date share one HTTP call. */
const dateFixturesCache = new Map<string, Stamped<any[] | null>>();

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
  enforceMaxSize(map);
}

/**
 * Prevent unbounded memory growth across all FotMob caches.
 * Evicts stale entries first, then enforces per-map max size.
 */
function enforceMaxSize<K, V>(map: Map<K, Stamped<V>>): void {
  // Evict stale entries
  const now = Date.now();
  for (const [k, entry] of map.entries()) {
    if (now >= entry.exp) map.delete(k);
  }
  // Enforce max size (oldest entries first)
  if (map.size > MAX_CACHE_SIZE) {
    const toDelete = map.size - MAX_CACHE_SIZE;
    let i = 0;
    for (const k of map.keys()) {
      if (i >= toDelete) break;
      map.delete(k);
      i++;
    }
  }
}

function matchCacheKey(date: string, home: string, away: string): string {
  return `${date}|${normaliseName(home)}|${normaliseName(away)}`;
}

/**
 * Order-independent team-name key: normalised tokens sorted alphabetically.
 * Lets us match providers that spell a team with the tokens in a different
 * order — e.g. ESPN "Congo DR" vs FotMob "DR Congo" both → "congo dr".
 * Requires the SAME set of tokens, so it won't conflate genuinely different
 * teams like "Congo" ({congo}) and "DR Congo" ({congo, dr}).
 */
function teamTokenKey(name: string): string {
  return normaliseName(name).split(" ").filter(Boolean).sort().join(" ");
}

/* -------------------------------------------------------------------------- */
/* Match ID lookup                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Fetch all FotMob fixtures for a given date (batches into a single HTTP call
 * across all callers sharing the same date).  Uses the
 * /api/data/matches?date=YYYYMMDD endpoint.
 */
async function fetchFotmobDateFixtures(date: string): Promise<any[]> {
  if (cacheHas(dateFixturesCache, date)) {
    return cacheGet(dateFixturesCache, date) ?? [];
  }
  try {
    const url = `${FOTMOB_BASE}/api/data/matches?date=${date}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      // Short TTL – the live data may change for in-play matches.
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      cacheSet(dateFixturesCache, date, []);
      return [];
    }
    const body: any = await res.json();
    const leagues: any[] = body?.leagues ?? [];
    const allMatches: any[] = [];
    for (const league of leagues) {
      const matches: any[] = league?.matches ?? [];
      if (Array.isArray(matches)) allMatches.push(...matches);
    }
    cacheSet(dateFixturesCache, date, allMatches);
    return allMatches;
  } catch {
    cacheSet(dateFixturesCache, date, []);
    return [];
  }
}

/**
 * Find a FotMob match ID by date and team names.  Uses the
 * /api/data/matches?date=YYYYMMDD endpoint (which still works without
 * Cloudflare verification).  All match-ID lookups for the same date share
 * a single HTTP request via fetchFotmobDateFixtures.
 */
export async function fetchFotmobMatchId(
  dateISO: string,
  homeTeamName: string,
  awayTeamName: string
): Promise<number | null> {
  const date = dateISOToYYYYMMDD(dateISO);
  const key = matchCacheKey(date, homeTeamName, awayTeamName);
  if (cacheHas(matchIdCache, key)) return cacheGet(matchIdCache, key) ?? null;

  const allMatches = await fetchFotmobDateFixtures(date);
  const homeNorm = normaliseName(homeTeamName);
  const awayNorm = normaliseName(awayTeamName);
  const homeKey = teamTokenKey(homeTeamName);
  const awayKey = teamTokenKey(awayTeamName);

  // Fallback candidate when no exact match exists: same token set, any order
  // (recovers provider spelling differences like "Congo DR" / "DR Congo").
  let fallbackId: number | null = null;

  for (const m of allMatches) {
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
    if (
      fallbackId === null &&
      teamTokenKey(m.home.name) === homeKey &&
      teamTokenKey(m.away.name) === awayKey
    ) {
      const id = parseInt(m.id, 10);
      if (!isNaN(id)) fallbackId = id;
    }
  }

  cacheSet(matchIdCache, key, fallbackId);
  return fallbackId;
}

/* -------------------------------------------------------------------------- */
/* Ratings scraper                                                            */
/* -------------------------------------------------------------------------- */

export interface FotmobLineupPlayer {
  id: number;
  name: string;
  shortName?: string;
  lastName?: string;
  shirtNumber?: number;
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
  /** FotMob's own flag for the lineup: "predicted" before kickoff, flips to a
   *  confirmed value (e.g. "confirmed"/"lineup") once the official XI is out. */
  lineupType: string | null;
}

/**
 * Shared helpers for fetching FotMob match page and extracting __NEXT_DATA__.
 */

async function fetchFotmobPageHtml(
  fotmobMatchId: number,
  bypassCache: boolean = false
): Promise<string | null> {
  // The match page URL has no query string, so the cache-buster must start a
  // new one with `?` — using `&` makes it part of the path slug and FotMob 404s.
  const cacheBuster = bypassCache ? `?_=${Date.now()}` : '';
  const url = `${FOTMOB_BASE}/match/${fotmobMatchId}${cacheBuster}`;
  const res = await fetch(url, {
    // `cache: 'no-store'` alone bypasses the Next data cache. Don't also pass
    // `next: { revalidate: 0 }` — Next rejects the conflicting combination.
    cache: bypassCache ? 'no-store' : undefined,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  return await res.text();
}

export function extractFotmobContent(html: string): Record<string, unknown> | null {
  // The `s` (dotall) flag lets `.` match newlines — essential since the JSON blob spans lines.
  const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/s);
  if (!nextDataMatch) return null;
  try {
    const parsed = JSON.parse(nextDataMatch[1]);
    const content = parsed?.props?.pageProps?.content;
    if (!content || typeof content !== "object") return null;
    return content as Record<string, unknown>;
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

export function extractRatings(content: any): Record<string, number> | null {
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

export function extractMotm(content: any): { name: string; teamName: string } | null {
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

export function extractFormation(content: any): { home: string | null; away: string | null } | null {
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

/** FotMob exposes shirt numbers as either numbers or numeric strings ("23"). */
function parseShirtNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function mapFotmobPlayer(p: any, includeLayout: boolean): FotmobLineupPlayer {
  const base: FotmobLineupPlayer = {
    id: p.id ?? 0,
    name: p.name ?? '',
    shortName: typeof p.shortName === "string" ? p.shortName : undefined,
    lastName: typeof p.lastName === "string" ? p.lastName : undefined,
    shirtNumber: parseShirtNumber(p.shirtNumber ?? p.shirt),
    positionId: p.positionId,
    usualPlayingPositionId: p.usualPlayingPositionId,
    isCaptain: p.isCaptain === true,
    performance: p.performance ? { rating: p.performance?.rating ?? null } : undefined,
  };
  if (includeLayout) {
    if (p.horizontalLayout) {
      base.horizontalLayout = {
        x: p.horizontalLayout.x,
        y: p.horizontalLayout.y,
        width: p.horizontalLayout.width,
        height: p.horizontalLayout.height,
      };
    }
    if (p.verticalLayout) {
      base.verticalLayout = {
        x: p.verticalLayout.x,
        y: p.verticalLayout.y,
        width: p.verticalLayout.width,
        height: p.verticalLayout.height,
      };
    }
  }
  return base;
}

function extractTeamLineup(team: any): { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null {
  if (!team) return null;
  const starters = Array.isArray(team.starters) ? team.starters : [];
  const subs = Array.isArray(team.subs) ? team.subs : [];
  return {
    starters: starters.map((p: any) => mapFotmobPlayer(p, true)),
    subs: subs.map((p: any) => mapFotmobPlayer(p, false)),
  };
}

export function extractLineup(content: any): { home: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null; away: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null } | null {
  const lineup = content?.lineup;
  if (!lineup) return null;
  if (!lineup.homeTeam || !lineup.awayTeam) return null;

  return {
    home: extractTeamLineup(lineup.homeTeam),
    away: extractTeamLineup(lineup.awayTeam),
  };
}

/** "predicted" before kickoff; flips to a confirmed value once the XI is official. */
export function extractLineupType(content: any): string | null {
  const t = content?.lineup?.lineupType;
  return typeof t === "string" ? t : null;
}

/** True unless FotMob explicitly flags the lineup as confirmed. */
export function isPredictedLineupType(lineupType: string | null | undefined): boolean {
  return (lineupType ?? "predicted").toLowerCase() !== "confirmed";
}

/**
 * FotMob's curated short name for pitch labels. Confirmed/finished lineups carry
 * a `shortName` ("Alisson"); predicted lineups omit it but `lastName` is correct
 * ("De Bruyne"). Falls back to the last token of the full name.
 */
export function fotmobDisplayName(p: { shortName?: string; lastName?: string; name: string }): string {
  return (
    p.shortName?.trim() ||
    p.lastName?.trim() ||
    p.name.split(" ").filter(Boolean).pop() ||
    p.name
  );
}

/* -------------------------------------------------------------------------- */
/* Build a lineup directly from FotMob (used for PREDICTED upcoming XIs)        */
/* -------------------------------------------------------------------------- */

/**
 * Build a `LineupPlayer[]` directly from FotMob's lineup for one team. Used for
 * upcoming fixtures where ESPN has no roster yet, so we can't enrich an existing
 * lineup — we construct it from FotMob's predicted XI instead. Positions come
 * from FotMob's slot-based `positionId` + `verticalLayout.x` (same scheme used
 * for confirmed lineups); subs fall back to the coarse usual-position map.
 */
export function buildLineupFromFotmob(
  team: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null | undefined
): LineupPlayer[] {
  if (!team) return [];

  const build = (p: FotmobLineupPlayer, starter: boolean): LineupPlayer => {
    const verticalX = p.verticalLayout?.x ?? 0.5;
    const position: PlayerPosition = starter
      ? getFotmobPosition(p.positionId, verticalX)
          ?? (p.usualPlayingPositionId != null ? USUAL_POS_MAP[p.usualPlayingPositionId] : undefined)
          ?? "MF"
      : (p.usualPlayingPositionId != null ? USUAL_POS_MAP[p.usualPlayingPositionId] : undefined) ?? "MF";

    const layout =
      starter &&
      p.verticalLayout &&
      typeof p.verticalLayout.x === "number" &&
      typeof p.verticalLayout.y === "number"
        ? { x: p.verticalLayout.x, y: p.verticalLayout.y }
        : undefined;

    const united = matchUnitedPlayer(p.name);

    return {
      id: String(p.id || `fm-${normaliseName(p.name)}`),
      name: p.name,
      displayName: fotmobDisplayName(p),
      shirtNumber: p.shirtNumber ?? 0,
      position,
      starter,
      minutesPlayed: 0,
      rating: p.performance?.rating ?? undefined,
      captain: p.isCaptain === true,
      ...(layout && { layout }),
      isUnitedPlayer: Boolean(united),
      ...(united && { unitedPlayerId: united.id }),
    };
  };

  return [
    ...(team.starters ?? []).map((p) => build(p, true)),
    ...(team.subs ?? []).map((p) => build(p, false)),
  ];
}

/**
 * Build both-side lineups from FotMob match data. Returns null if either side is
 * missing so callers can fall back cleanly.
 */
export function buildLineupsFromFotmob(
  lineup: FotmobMatchData["lineup"]
): { home: LineupPlayer[]; away: LineupPlayer[] } | null {
  if (!lineup?.home || !lineup?.away) return null;
  return {
    home: buildLineupFromFotmob(lineup.home),
    away: buildLineupFromFotmob(lineup.away),
  };
}


export async function fetchFotmobMatchData(
  fotmobMatchId: number,
  bypassCache: boolean = false
): Promise<FotmobMatchData | null> {
  if (!bypassCache && cacheHas(matchDataCache, fotmobMatchId)) {
    return cacheGet(matchDataCache, fotmobMatchId) ?? null;
  }

  try {
    const html = await fetchFotmobPageHtml(fotmobMatchId, bypassCache);
    if (!html) {
      console.warn(`fotmob[${fotmobMatchId}]: failed to fetch match page (HTTP error)`);
      cacheSet(matchDataCache, fotmobMatchId, null);
      cacheSet(ratingsCache, fotmobMatchId, null);
      cacheSet(motmCache, fotmobMatchId, null);
      return null;
    }

    const content = extractFotmobContent(html);
    if (!content) {
      console.warn(`fotmob[${fotmobMatchId}]: __NEXT_DATA__ extraction failed — FotMob page structure may have changed`);
      cacheSet(matchDataCache, fotmobMatchId, null);
      cacheSet(ratingsCache, fotmobMatchId, null);
      cacheSet(motmCache, fotmobMatchId, null);
      return null;
    }

    const lineupExtracted = extractLineup(content);
    const formationExtracted = extractFormation(content);

    const result = {
      ratings: extractRatings(content),
      motm: extractMotm(content),
      formation: formationExtracted,
      lineup: lineupExtracted,
      lineupType: extractLineupType(content),
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
/** Maps FotMob's `usualPlayingPositionId` (0-3) to a coarse PlayerPosition. */
const USUAL_POS_MAP: Record<number, PlayerPosition> = { 0: 'GK', 1: 'DF', 2: 'MF', 3: 'FW' };

export function getFotmobPosition(positionId: number | undefined, verticalX: number): PlayerPosition | null {
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
/**
 * Match each ESPN starter to a FotMob starter by name, keyed by ESPN player id.
 *
 *   Pass 1: exact normalised-name match.
 *   Pass 2: for the leftovers, a token-subset match (one name's tokens are a
 *           subset of the other's, e.g. FotMob "Gabriel" ⊂ ESPN "Gabriel
 *           Magalhães"), applied only when exactly one candidate qualifies so a
 *           short name can't be assigned to the wrong player.
 *
 * Matching by name is inherently imperfect across providers, so this widens the
 * net just enough to recover common short/long-form gaps without false matches.
 */
function matchStartersByName(
  espnStarters: LineupPlayer[],
  fmStarters: FotmobLineupPlayer[]
): Map<string, FotmobLineupPlayer> {
  const result = new Map<string, FotmobLineupPlayer>();
  const usedFm = new Set<FotmobLineupPlayer>();

  const fmByNorm = new Map<string, FotmobLineupPlayer>();
  for (const f of fmStarters) {
    const key = normaliseName(f.name);
    if (!fmByNorm.has(key)) fmByNorm.set(key, f);
  }
  for (const e of espnStarters) {
    const f = fmByNorm.get(normaliseName(e.name));
    if (f && !usedFm.has(f)) {
      result.set(e.id, f);
      usedFm.add(f);
    }
  }

  const tokensOf = (name: string) => normaliseName(name).split(" ").filter(Boolean);
  for (const e of espnStarters) {
    if (result.has(e.id)) continue;
    const eTokens = tokensOf(e.name);
    if (eTokens.length === 0) continue;
    const eSet = new Set(eTokens);
    const candidates = fmStarters.filter((f) => {
      if (usedFm.has(f)) return false;
      const fTokens = tokensOf(f.name);
      if (fTokens.length === 0) return false;
      const fSet = new Set(fTokens);
      const fSubsetE = fTokens.every((t) => eSet.has(t));
      const eSubsetF = eTokens.every((t) => fSet.has(t));
      return fSubsetE || eSubsetF;
    });
    if (candidates.length === 1) {
      result.set(e.id, candidates[0]);
      usedFm.add(candidates[0]);
    }
  }
  return result;
}

export function applyFotmobPositions(
  espnLineup: LineupPlayer[],
  fotmobLineup: { starters: FotmobLineupPlayer[]; subs: FotmobLineupPlayer[] } | null | undefined,
  formation?: string | null
): LineupPlayer[] {
  if (fotmobLineup?.starters) {
    const starterMatch = matchStartersByName(
      espnLineup.filter((p) => p.starter),
      fotmobLineup.starters
    );
    const subsMap = new Map(
      (fotmobLineup.subs ?? []).map((p) => [normaliseName(p.name), p])
    );
    const usualPosMap = USUAL_POS_MAP;

    const result = espnLineup.map((p) => {
      if (p.starter) {
        const fm = starterMatch.get(p.id);
        if (fm) {
          const verticalX = fm.verticalLayout?.x ?? 0.5;
          const finalPos = getFotmobPosition(fm.positionId, verticalX) ?? p.position;
          // Capture FotMob's exact pitch coordinates so the formation view can
          // place this starter precisely instead of re-deriving from the label.
          const layout =
            fm.verticalLayout &&
            typeof fm.verticalLayout.x === "number" &&
            typeof fm.verticalLayout.y === "number"
              ? { x: fm.verticalLayout.x, y: fm.verticalLayout.y }
              : undefined;
          return {
            ...p,
            position: finalPos,
            displayName: fotmobDisplayName(fm),
            captain: fm.isCaptain === true || p.captain,
            ...(layout && { layout }),
          };
        }
      } else {
        const fm = subsMap.get(normaliseName(p.name));
        if (fm) {
          const captain = fm.isCaptain === true || p.captain;
          const displayName = fotmobDisplayName(fm);
          if (fm.usualPlayingPositionId !== undefined && fm.usualPlayingPositionId !== null) {
            const mappedPos = usualPosMap[fm.usualPlayingPositionId];
            if (mappedPos) return { ...p, position: mappedPos, displayName, captain };
          }
          return { ...p, displayName, captain };
        }
      }
      return p;
    });
    if (!formation) return result;
    return applyFormationRefinement(result, formation);
  }

  if (!formation) {
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
    return espnLineup;
  }

  const starters = espnLineup.filter(p => p.starter);
  const subs = espnLineup.filter(p => !p.starter);

  const specCounts = { DEF: 0, MID: 0, WF: 0, FW: 0 };
  const genericMf: LineupPlayer[] = [];
  const genericFw: LineupPlayer[] = [];

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

  const gaps = {
    DEF: Math.max(0, catCounts.DEF - specCounts.DEF),
    MID: Math.max(0, catCounts.MID - specCounts.MID),
    WF: Math.max(0, catCounts.WF - specCounts.WF),
    FW: Math.max(0, catCounts.FW - specCounts.FW),
  };

  const fillOrder: ("DEF" | "MID" | "WF" | "FW")[] = ["DEF", "MID", "WF", "FW"];
  const mfAssignments = new Map<string, PlayerPosition>();
  let mfIdx = 0;

  for (const cat of fillOrder) {
    let needed = gaps[cat];
    while (needed > 0 && mfIdx < genericMf.length) {
      const targetPos: PlayerPosition = cat === "DEF" ? "DF" : cat === "MID" ? "MF" : cat === "WF" ? "LW" : "FW";
      mfAssignments.set(normaliseName(genericMf[mfIdx].name), targetPos);
      mfIdx++;
      needed--;
    }
  }

  while (mfIdx < genericMf.length) {
    mfAssignments.set(normaliseName(genericMf[mfIdx].name), "CM");
    mfIdx++;
  }

  const fwAssignments = new Map<string, PlayerPosition>();
  let fwGapNeeded = gaps.FW;
  for (const p of genericFw) {
    if (fwGapNeeded > 0) {
      fwAssignments.set(normaliseName(p.name), "ST");
      fwGapNeeded--;
    } else {
      fwAssignments.set(normaliseName(p.name), "LW");
    }
  }

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