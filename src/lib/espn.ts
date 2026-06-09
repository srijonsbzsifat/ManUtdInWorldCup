import { fetchJson, isLive } from "@/lib/fetch";
import { flagImageUrl } from "@/lib/flags";
import type {
  LineupPlayer,
  Match,
  MatchEvent,
  MatchScore,
  MatchStatus,
  MatchTeam,
  PlayerPosition,
} from "@/types";
import { matchUnitedPlayer, normaliseName } from "@/lib/players";
import { fetchFotmobMatchId, fetchFotmobLineupRatings, fetchFotmobMotm, applyFotmobRatings } from "@/lib/fotmob";

/* -------------------------------------------------------------------------- */
/* ESPN public API adapter                                                    */
/* -------------------------------------------------------------------------- */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";

/** Competitions we care about - the World Cup, qualifying, and friendlies. */
const COMPETITION_SLUGS = [
  { slug: "fifa.world", matchType: "world_cup" as const, name: "FIFA World Cup" },
  { slug: "fifa.friendly", matchType: "friendly" as const, name: "International Friendly" },
  { slug: "fifa.wcq.uefa", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Europe" },
  { slug: "fifa.wcq.conmebol", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - South America" },
  { slug: "fifa.wcq.concacaf", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Concacaf" },
  { slug: "fifa.wcq.afc", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Asia" },
  { slug: "fifa.wcq.caf", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Africa" },
  { slug: "fifa.wcq.ofc", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Oceania" },
];

/* -------------------------------------------------------------------------- */
/* Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

function mapStatus(raw: any): { status: MatchStatus; minute: number | string | null } {
  const state = String(raw?.state ?? raw?.name ?? "").toUpperCase();
  const id = String(raw?.id ?? "").toUpperCase();
  const description = String(raw?.description ?? "").toLowerCase();
  const detail = String(raw?.detail ?? "").toLowerCase();
  const shortDetail = String(raw?.shortDetail ?? "").toLowerCase();

  let status: MatchStatus = "SCHEDULED";
  if (state === "PRE" || id === "1" || id === "0") status = "SCHEDULED";
  else if (state === "IN" || id === "2") status = "IN_PLAY";
  else if (state === "POST" || id === "3") status = "FINISHED";
  else if (description.includes("postponed") || detail.includes("postponed")) status = "POSTPONED";
  else if (description.includes("suspended")) status = "SUSPENDED";
  else if (description.includes("canceled") || description.includes("cancelled")) status = "CANCELED";
  else if (description.includes("halftime") || detail.includes("halftime") || shortDetail.includes("ht")) status = "PAUSED";

  // Extract current minute if available.
  let minute: number | string | null = null;
  if (status === "IN_PLAY" || status === "PAUSED") {
    if (status === "PAUSED") minute = "HT";
    else {
      const match = /(\d+)/.exec(raw?.displayClock || raw?.clock || raw?.detail || raw?.shortDetail || "");
      if (match) minute = parseInt(match[1], 10);
      else if (typeof raw?.clock === "number") minute = raw.clock;
    }
  } else if (status === "FINISHED") {
    minute = "FT";
  }

  return { status, minute };
}

function mapTeam(team: any, homeAway: "home" | "away"): MatchTeam {
  const colors = team?.color ? `#${String(team.color).replace(/^#/, "")}` : "#1A1A1A";
  const abbrev = String(team?.abbreviation ?? "").toUpperCase();
  return {
    id: String(team?.id ?? ""),
    name: String(team?.displayName ?? team?.name ?? "Unknown"),
    shortName: String(team?.shortDisplayName ?? team?.abbreviation ?? team?.name ?? "TBD"),
    code: abbrev,
    flag: teamToFlag(team?.abbreviation, team?.displayName ?? team?.name),
    flagUrl: flagImageUrl(abbrev) ?? undefined,
    color: colors,
    logoUrl: team?.logos?.[0]?.href ?? team?.logo,
  };
}

function teamToFlag(abbrev: any, name: any): string {
  const code = String(abbrev ?? "").toUpperCase();
  if (code.length === 3) {
    // Use the first 2 letters - that's the ISO 3166 alpha-2 mapping that
    // regional indicator symbols (the flag emoji) are based on.
    const raw = code
      .slice(0, 2)
      .split("")
      .map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)))
      .join("");
    return fixMojibake(raw);
  }
  return fixMojibake("🏳️");
}

/**
 * The regional indicator symbols that make up a flag emoji (U+1F1E6..U+1F1FF)
 * are stored as 4 UTF-8 bytes each.  If a string in the JSON response shows
 * up as 8 broken code points (U+00F0, U+009F, U+0087, U+00A7, ...) it's
 * almost always a sign the bytes were misread as Latin-1 somewhere along the
 * way.  Detect that pattern and reverse the damage.
 */
function fixMojibake(s: string): string {
  if (!s) return s;
  // Quick check: a healthy flag has 2 code points of 4 UTF-8 bytes each
  // (8 bytes total).  A mojibake'd flag has ~8 code points of ~2 bytes each
  // (~16 bytes).  Use the ratio of UTF-8 byte count to character count to
  // decide.
  if (typeof Buffer !== "undefined") {
    const bytes = Buffer.byteLength(s, "utf8");
    const chars = s.length;
    if (bytes > chars * 2) {
      try {
        return Buffer.from(s, "latin1").toString("utf8");
      } catch {
        return s;
      }
    }
  }
  return s;
}

function parseScore(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function mapPosition(abbrev: any): PlayerPosition {
  const pos = String(abbrev ?? "").toUpperCase();
  const map: Record<string, PlayerPosition> = {
    G: "GK", GK: "GK", GOALKEEPER: "GK",
    D: "DF", DEF: "DF", DEFENDER: "DF",
    CB: "CB", LB: "LB", RB: "RB",
    M: "MF", MID: "MF", MIDFIELDER: "MF",
    DM: "DM", CM: "CM", AM: "AM",
    F: "FW", FW: "FW", FORWARD: "FW",
    ST: "ST", CF: "CF", LW: "LW", RW: "RW",
  };
  return map[pos] ?? "MF";
}

function safeName(p: any): string {
  return String(p?.athlete?.displayName ?? p?.athlete?.fullName ?? p?.name ?? "Unknown");
}

/* -------------------------------------------------------------------------- */
/* Summary endpoint                                                           */
/* -------------------------------------------------------------------------- */

export interface EspnSummary {
  header: any;
  boxscore?: any;
  scoring?: any[];
  keyEvents?: any[];
  plays?: any[];
  commentary?: any;
  leaders?: any[];
  winProbability?: any[];
  article?: any;
  /** Top-level team rosters. Each entry has `homeAway`, `team` and (usually) a
   *  `roster` array of player objects. */
  rosters?: any[];
}

export async function getMatchSummary(
  eventId: string,
  slug: string = "fifa.world"
): Promise<EspnSummary | null> {
  try {
    const url = `${ESPN_BASE}/${slug}/summary?event=${eventId}`;
    return await fetchJson<EspnSummary>(url, { next: { revalidate: 30 } });
  } catch (err) {
    console.warn("ESPN summary fetch failed for", eventId, slug, err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping a full match from an ESPN summary                                  */
/* -------------------------------------------------------------------------- */

export function summaryToMatch(
  summary: EspnSummary,
  fallback: { slug: string; matchType: Match["matchType"]; name: string }
): Match | null {
  const competition = summary?.header?.competitions?.[0];
  if (!competition) return null;

  const home = competition.competitors?.find((c: any) => c.homeAway === "home");
  const away = competition.competitors?.find((c: any) => c.homeAway === "away");
  if (!home || !away) return null;

  const { status, minute } = mapStatus(competition.status?.type);

  const match: Match = {
    id: String(competition.id ?? summary.header?.id ?? ""),
    competition: {
      id: String(competition.id ?? ""),
      name: String(competition?.notes?.find?.((n: any) => n?.type === "event")?.headline ?? fallback.name),
      emblem: competition?.competitionRecord?.[0]?.abbreviation,
    },
    kickoff: competition.date ?? competition.startDate ?? (() => {
      console.warn(`summaryToMatch: competition ${competition.id ?? "unknown"} has no date field`);
      return new Date(0).toISOString();
    })(),
    status,
    minute,
    home: mapTeam(home.team, "home"),
    away: mapTeam(away.team, "away"),
    score: { home: parseScore(home.score), away: parseScore(away.score) },
    venue: competition.venue?.fullName,
    city: competition.venue?.address?.city,
    matchType: fallback.matchType,
    espnSlug: fallback.slug,
    events: mapEvents(summary, home.team?.id, away.team?.id, { home: parseScore(home.score), away: parseScore(away.score) }),
    lineups: mapLineups(summary, home.team?.id, away.team?.id),
    motm: mapMOTM(summary),
  };

  return match;
}

function mapMOTM(summary: EspnSummary): Match["motm"] {
  const leaders = summary?.leaders ?? [];
  for (const category of leaders) {
    if (category?.name?.toLowerCase?.().includes("player of the match")) {
      const leader = category?.leaders?.[0];
      if (leader?.athlete?.displayName) {
        return {
          name: leader.athlete.displayName,
          team: leader.team?.id === summary?.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === "home")?.team?.id
            ? "home"
            : "away",
        };
      }
    }
  }
  return undefined;
}

function mapEvents(
  summary: EspnSummary,
  homeTeamId: any,
  awayTeamId: any,
  currentScore: MatchScore
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const plays = summary?.plays ?? [];
  const details = summary?.header?.competitions?.[0]?.details ?? [];
  const allEvents = [...plays, ...details];
  let runningScore = { home: 0, away: 0 };

  for (const play of allEvents) {
    // Handle both formats: plays (type.text/type.abbreviation) and details (scoringPlay/redCard flags)
    const isDetailFormat = play?.scoringPlay !== undefined || play?.redCard !== undefined;
    let type = "";
    if (isDetailFormat) {
      if (play.scoringPlay) type = "goal";
      else if (play.redCard) type = "red_card";
      else if (play.penaltyKick) type = "penalty";
    } else {
      type = String(play?.type?.text ?? play?.type?.abbreviation ?? "").toLowerCase();
    }
    
    const teamId = play?.team?.id;
    const team: "home" | "away" = String(teamId) === String(homeTeamId) ? "home" : "away";
    const minute = parseClockMinute(play?.clock);
    const stoppage = parseStoppage(play?.clock);

    if (type.includes("kickoff") && !play?.scoringPlay) {
      events.push({
        id: String(play?.id ?? `evt-${minute}-ko`),
        minute: minute ?? 0,
        type: "kickoff",
        team,
        detail: team === "home" ? "Kick off" : "Kick off",
      });
      continue;
    }

    if (type.includes("goal") || (isDetailFormat && play.scoringPlay)) {
      // In detail format, first participant is scorer, second (if present) is assist
      const participants = play?.participants ?? [];
      const scorer = isDetailFormat ? participants[0] : participants.find((p: any) => p?.type === "SCORER" || p?.position === "scorer");
      const assist = isDetailFormat ? participants[1] : participants.find((p: any) => p?.type === "ASSIST" || p?.position === "assist");
      if (team === "home") runningScore.home += 1;
      else runningScore.away += 1;
      events.push({
        id: String(play?.id ?? `evt-${minute}-goal`),
        minute: minute ?? 0,
        stoppage,
        type: "goal",
        team,
        player: scorer
          ? { id: String(scorer.athlete?.id ?? ""), name: safeName(scorer) }
          : undefined,
        assistPlayer: assist
          ? { id: String(assist.athlete?.id ?? ""), name: safeName(assist) }
          : undefined,
        detail: play?.text,
        scoreAfter: { ...runningScore },
      });
      continue;
    }

    if ((type.includes("penalty") && play?.scoringPlay) || (isDetailFormat && play.penaltyKick && play.scoringPlay)) {
      // In detail format, first participant is scorer
      const participants = play?.participants ?? [];
      const scorer = isDetailFormat ? participants[0] : participants.find((p: any) => p?.type === "SCORER" || p?.position === "scorer");
      if (team === "home") runningScore.home += 1;
      else runningScore.away += 1;
      events.push({
        id: String(play?.id ?? `evt-${minute}-pen`),
        minute: minute ?? 0,
        stoppage,
        type: "penalty_scored",
        team,
        player: scorer
          ? { id: String(scorer.athlete?.id ?? ""), name: safeName(scorer) }
          : undefined,
        detail: "Penalty scored",
        scoreAfter: { ...runningScore },
      });
      continue;
    }

    if (type.includes("miss") && type.includes("penalty")) {
      events.push({
        id: String(play?.id ?? `evt-${minute}-pmiss`),
        minute: minute ?? 0,
        stoppage,
        type: "penalty_missed",
        team,
        player: play?.participants?.[0]
          ? { id: String(play.participants[0].athlete?.id ?? ""), name: safeName(play.participants[0]) }
          : undefined,
        detail: "Penalty missed",
      });
      continue;
    }

    if (type.includes("yellow") || (isDetailFormat && play.yellowCard)) {
      const participants = play?.participants ?? [];
      const player = isDetailFormat ? participants[0] : participants[0];
      events.push({
        id: String(play?.id ?? `evt-${minute}-yc`),
        minute: minute ?? 0,
        stoppage,
        type: "yellow_card",
        team,
        player: player
          ? { id: String(player.athlete?.id ?? ""), name: safeName(player) }
          : undefined,
        detail: play?.text,
      });
      continue;
    }

    if (type.includes("red") || (isDetailFormat && play.redCard)) {
      const participants = play?.participants ?? [];
      const player = isDetailFormat ? participants[0] : participants[0];
      events.push({
        id: String(play?.id ?? `evt-${minute}-rc`),
        minute: minute ?? 0,
        stoppage,
        type: "red_card",
        team,
        player: player
          ? { id: String(player.athlete?.id ?? ""), name: safeName(player) }
          : undefined,
        detail: play?.text,
      });
      continue;
    }

    if (type.includes("substitution")) {
      const inP = play?.participants?.find((p: any) => p?.type === "IN" || p?.position === "in");
      const outP = play?.participants?.find((p: any) => p?.type === "OUT" || p?.position === "out");
      events.push({
        id: String(play?.id ?? `evt-${minute}-sub`),
        minute: minute ?? 0,
        stoppage,
        type: "substitution",
        team,
        player: inP
          ? { id: String(inP.athlete?.id ?? ""), name: safeName(inP) }
          : undefined,
        detail: outP ? `On for ${safeName(outP)}` : "Substitution",
      });
      continue;
    }

    if (type.includes("half") || type.includes("end of period")) {
      events.push({
        id: String(play?.id ?? `evt-${minute}-ht`),
        minute: minute ?? 90,
        type: minute && minute <= 45 ? "half_time" : "full_time",
        team: "home",
        detail: minute && minute <= 45 ? "Half time" : "Full time",
      });
      continue;
    }
  }
  return events;
}

function parseClockMinute(clock: any): number | null {
  if (clock === null || clock === undefined) return null;
  if (typeof clock === "number") return clock;
  // The roster-level plays use `{ clock: { displayValue: "45'" } }`.  The
  // top-level plays use `{ clock: "45'" }` (or "45'+2").  Handle both.
  // Details format uses `{ clock: { displayValue: "45'+2'", value: 2700 } }`
  // and `{ addedClock: { displayValue: "2", value: 95 } }`
  const raw = typeof clock === "string"
    ? clock
    : clock.displayValue ?? clock.value ?? "";
  const m = String(raw).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseStoppage(clock: any): number | undefined {
  if (!clock) return undefined;
  // Check addedClock first (details format)
  if (clock.addedClock !== undefined) {
    const raw = typeof clock.addedClock === "string"
      ? clock.addedClock
      : clock.addedClock.displayValue ?? clock.addedClock.value ?? "";
    const m = String(raw).match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  // Fallback to clock displayValue
  const raw = typeof clock === "string"
    ? clock
    : clock.displayValue ?? clock.value ?? "";
  const m = String(raw).match(/\+(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Lineups                                                                    */
/* -------------------------------------------------------------------------- */

function mapLineups(
  summary: EspnSummary,
  homeTeamId: any,
  awayTeamId: any
): Match["lineups"] | undefined {
  // ESPN exposes the full squad list under `summary.rosters[]` (one entry per
  // team).  The boxscore/teams[].roster field is usually empty for friendlies,
  // qualifiers and group-stage fixtures.  Some friendlies don't have a roster
  // at all - in that case we fall back to whatever is in boxscore.
  const rosterEntries: any[] = [];

  if (Array.isArray(summary?.rosters)) {
    for (const r of summary.rosters) {
      if (r?.roster) rosterEntries.push(r);
    }
  }
  if (rosterEntries.length === 0 && Array.isArray(summary?.boxscore?.teams)) {
    for (const t of summary.boxscore.teams) {
      if (t?.roster?.length) rosterEntries.push(t);
    }
  }

  if (rosterEntries.length === 0) return undefined;

  // Compute team-level clean sheets from the final score.
  const homeScore = parseInt(String(summary?.header?.competitions?.[0]?.competitors?.find((c: any) => String(c?.team?.id) === String(homeTeamId))?.score ?? 0), 10) || 0;
  const awayScore = parseInt(String(summary?.header?.competitions?.[0]?.competitors?.find((c: any) => String(c?.team?.id) === String(awayTeamId))?.score ?? 0), 10) || 0;
  const homeCleanSheet = awayScore === 0;
  const awayCleanSheet = homeScore === 0;

  const home: LineupPlayer[] = [];
  const away: LineupPlayer[] = [];

  for (const t of rosterEntries) {
    const teamId = t?.team?.id;
    const roster = t?.roster ?? [];
    if (!Array.isArray(roster) || roster.length === 0) continue;
    for (const p of roster) {
      const athlete = p?.athlete ?? p;
      // ESPN puts `starter`, `subbedIn`, `subbedOut` and `jersey` on the
      // roster entry itself (not on the nested athlete object).
      const starter = Boolean(p?.starter ?? athlete?.starter);
      const subbedIn = Boolean(p?.subbedIn ?? athlete?.subbedIn);
      const subbedOut = Boolean(p?.subbedOut ?? athlete?.subbedOut);
      const name = String(athlete?.displayName ?? athlete?.fullName ?? "Unknown");

      const subOnMinute = subbedIn
        ? extractSubMinute(playerPlaysForEvent(p, true))
        : null;
      const subOffMinute = subbedOut
        ? extractSubMinute(playerPlaysForEvent(p, false))
        : null;

      const minutes = computeMinutesPlayed(starter, subOnMinute, subOffMinute);
      const stats = extractStats(p);
      const position = mapPosition(athlete?.position?.abbreviation ?? p?.position?.abbreviation);
      const rating = extractRating(athlete, p, position);
      const goals = (stats.goals ?? 0) + (stats.ownGoals ?? 0);
      const matched = matchUnitedPlayer(name);

      const player: LineupPlayer = {
        id: String(athlete?.id ?? `unknown-${name}`),
        name,
        shirtNumber: parseInt(String(athlete?.jersey ?? p?.jersey ?? "0"), 10) || 0,
        position,
        starter,
        subOnMinute,
        subOffMinute,
        minutesPlayed: minutes,
        rating,
        captain: Boolean(athlete?.captain),
        goals: stats.goals,
        assists: stats.assists,
        yellowCards: stats.yellowCards,
        redCards: stats.redCards,
        ownGoals: stats.ownGoals,
        goalsConceded: stats.goalsConceded,
        saves: stats.saves,
        isUnitedPlayer: Boolean(matched),
        unitedPlayerId: matched?.id,
      };

      // Decide the per-player clean sheet from the team-level result.
      // The GK only gets credit if they actually played; outfield players
      // need to have played a meaningful share of the match.
      const isGk = position === "GK";
      const teamClean = String(teamId) === String(homeTeamId) ? homeCleanSheet : awayCleanSheet;
      const played = (player.minutesPlayed ?? 0) > 0;
      if (teamClean && ((isGk && played) || (player.minutesPlayed ?? 0) >= 60)) {
        player.cleanSheet = true;
      }

      if (String(teamId) === String(homeTeamId)) home.push(player);
      else if (String(teamId) === String(awayTeamId)) away.push(player);
    }
  }

  if (home.length === 0 && away.length === 0) return undefined;
  return { home, away };
}

function playsForPlayer(summary: EspnSummary, playerName: string, position: "IN" | "OUT"): any[] {
  return (summary?.plays ?? []).filter((p: any) => {
    if (!String(p?.type?.text ?? "").toLowerCase().includes("substitution")) return false;
    return (p.participants ?? []).some((part: any) => {
      const type = String(part?.type ?? part?.position ?? "").toUpperCase();
      return type === position && String(part?.athlete?.displayName ?? "").toLowerCase() === playerName.toLowerCase();
    });
  });
}

/**
 * Find the substitution play on the player's own `plays` array.  Each entry
 * has a `substitution: true` flag and a `clock.displayValue` with the minute.
 */
function playerPlaysForEvent(p: any, _isSubIn: boolean): any[] {
  return (p?.plays ?? []).filter((pl: any) => Boolean(pl?.substitution));
}

function extractSubMinute(plays: any[]): number | null {
  if (!plays || plays.length === 0) return null;
  return parseClockMinute(plays[0]?.clock);
}

function computeMinutesPlayed(
  starter: boolean,
  subOn: number | null,
  subOff: number | null
): number {
  if (starter && subOff == null) return 90;
  if (!starter && subOn != null) return Math.max(0, 90 - subOn);
  if (starter && subOff != null) return subOff;
  return 0;
}

function extractRating(athlete: any, p: any, position: PlayerPosition): number | null {
  // ESPN does not always include ratings.  We first try the explicit rating
  // fields and, if nothing is found, derive a simple FotMob-style rating from
  // the available per-player statistics so the UI has something to show.
  const candidates = [
    athlete?.rating,
    p?.rating,
    p?.stats?.find?.((s: any) => /rating/i.test(s?.name ?? ""))?.value,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const n = parseFloat(String(c));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return computeRatingFromStats(p, position);
}

/**
 * Derive a 1-10 rating from the individual stats that ESPN exposes for a
 * player.  This is intentionally simple: it only uses the stats we already
 * extract, so it works for any match.  Outfield and goalkeepers use different
 * weights.
 */
function computeRatingFromStats(p: any, position: PlayerPosition): number | null {
  if (!p?.stats || !Array.isArray(p.stats) || p.stats.length === 0) return null;
  const arr = p.stats;
  const get = (name: string) => {
    const s = arr.find((x: any) => x?.name === name);
    if (!s) return 0;
    const n = parseFloat(String(s.value));
    return Number.isFinite(n) ? n : 0;
  };

  let rating = 6.0;
  // Negative contributions - apply to everyone.
  rating -= get("yellowCards") * 0.3;
  rating -= get("redCards") * 1.0;
  rating -= get("ownGoals") * 0.5;

  if (position === "GK") {
    // Goalkeepers: rewarded for saves and clean sheets, punished for goals
    // conceded.  Caps keep one bad / brilliant game from swinging the value
    // by more than +/- 2.
    const saves = Math.min(get("saves"), 8);
    const conceded = Math.min(get("goalsConceded"), 5);
    rating += saves * 0.3;
    rating -= conceded * 0.5;
    if (conceded === 0 && saves > 0) rating += 0.5;
  } else {
    // Outfield: goals, assists, and clean sheets.
    rating += get("totalGoals") * 1.0;
    rating += get("goalAssists") * 0.5;
    if (position === "CB" || position === "LB" || position === "RB" || position === "DF") {
      // Defenders get a smaller clean-sheet bonus.
      const conceded = get("goalsConceded");
      if (conceded === 0 && (get("yellowCards") === 0)) rating += 0.4;
    }
  }

  // Clamp to FotMob's 1-10 range and round to one decimal.
  return Math.max(1, Math.min(10, Math.round(rating * 10) / 10));
}

function extractStats(p: any): {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  goalsConceded: number;
  saves: number;
  cleanSheet: boolean | undefined;
} {
  const arr = p?.stats ?? [];
  // Match by ESPN's stable stat name first, then by abbreviation/label as a
  // fallback.  Specific names must come BEFORE generic ones to avoid
  // "ownGoals" or "goalsConceded" matching a "goals" lookup.
  const findName = (name: string) =>
    arr.find((s: any) => s?.name === name);
  const findRe = (re: RegExp) =>
    arr.find((s: any) =>
      re.test(s?.name ?? "") || re.test(s?.abbreviation ?? "") || re.test(s?.displayName ?? "")
    );

  const toNum = (s: any) => (s === null || s === undefined ? 0 : Math.round(parseFloat(String(s))) || 0);

  const goals = toNum(findName("totalGoals")?.value ?? findRe(/^goals?$/i)?.value);
  const assists = toNum(findName("goalAssists")?.value ?? findRe(/^assists?$/i)?.value);
  const yellowCards = toNum(findName("yellowCards")?.value);
  const redCards = toNum(findName("redCards")?.value);
  const ownGoals = toNum(findName("ownGoals")?.value);
  const goalsConceded = toNum(findName("goalsConceded")?.value);
  const saves = toNum(findName("saves")?.value);
  // Don't infer clean sheets at the per-player level - ESPN's per-player
  // goalsConceded reflects what the team conceded while this player was on
  // the pitch, not whether the team ended with a clean sheet.  Awarding a
  // clean sheet to a sub who came on at 1-0 just because the team didn't
  // concede again is misleading.  The aggregator decides who gets a clean
  // sheet by comparing the final team score.
  const cleanSheet = Boolean(findName("cleanSheet")?.value) || undefined;

  return { goals, assists, yellowCards, redCards, ownGoals, goalsConceded, saves, cleanSheet };
}

/* -------------------------------------------------------------------------- */
/* Scoreboard endpoint                                                        */
/* -------------------------------------------------------------------------- */

export async function listCompetitionFixtures(
  slug: string,
  matchType: Match["matchType"],
  name: string,
  dateRange?: { start: Date; end: Date }
): Promise<Match[]> {
  const dates = dateRange
    ? `${formatDate(dateRange.start)}-${formatDate(dateRange.end)}`
    : undefined;
  const params = new URLSearchParams();
  if (dates) params.set("dates", dates);
  params.set("limit", "300");

  const url = `${ESPN_BASE}/${slug}/scoreboard?${params.toString()}`;

  let payload: any;
  try {
    payload = await fetchJson<any>(url, { next: { revalidate: 60 }, silent4xx: true });
  } catch (err: any) {
    if (!err?.silent) console.warn("ESPN scoreboard fetch failed for", slug, err);
    return [];
  }

  const events: any[] = payload?.events ?? [];
  const matches: Match[] = [];
  for (const evt of events) {
    const comp = evt?.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;
    const { status, minute } = mapStatus(comp.status?.type);

    matches.push({
      id: String(evt.id ?? comp.id),
      competition: { id: String(comp.id ?? evt.id), name },
      kickoff: evt.date ?? comp.date,
      status,
      minute,
      home: mapTeam(home.team, "home"),
      away: mapTeam(away.team, "away"),
      score: { home: parseScore(home.score), away: parseScore(away.score) },
      venue: comp.venue?.fullName,
      city: comp.venue?.address?.city,
      matchType,
      espnSlug: slug,
      events: [],
    });
  }
  return matches;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/* -------------------------------------------------------------------------- */
/* Aggregator: returns all fixtures for the competitions we care about        */
/* -------------------------------------------------------------------------- */

export interface FetchFixturesOptions {
  /** When defined, only return matches in this date range. */
  dateRange?: { start: Date; end: Date };
  /** If true, also fetch detailed summary for every match. */
  withDetails?: boolean;
}

export async function fetchAllFixtures(
  options: FetchFixturesOptions = {}
): Promise<Match[]> {
  const all: Match[] = [];
  const seen = new Set<string>();
  for (const c of COMPETITION_SLUGS) {
    const fixtures = await listCompetitionFixtures(c.slug, c.matchType, c.name, options.dateRange);
    for (const f of fixtures) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      all.push(f);
    }
  }
  // Sort by kickoff
  all.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  return all;
}

export async function fetchMatchDetails(match: Match): Promise<Match> {
  const slug = match.espnSlug ?? "fifa.friendly";
  const summary = await getMatchSummary(match.id, slug);
  if (summary) {
    const detailed = summaryToMatch(summary, {
      slug,
      matchType: match.matchType,
      name: match.competition.name,
    });
    if (detailed) {
      const enriched = { ...match, ...detailed, id: match.id };
      // Try to fetch real FotMob ratings for finished matches.
      if (enriched.status === "FINISHED" && enriched.lineups) {
        try {
          const fotmobId = await fetchFotmobMatchId(
            enriched.kickoff,
            enriched.home.name,
            enriched.away.name
          );
          if (fotmobId) {
            const fotmobRatings = await fetchFotmobLineupRatings(fotmobId);
            if (fotmobRatings) {
              enriched.lineups = {
                home: applyFotmobRatings(enriched.lineups.home, fotmobRatings),
                away: applyFotmobRatings(enriched.lineups.away, fotmobRatings),
              };
            }

            // Override MOTM with FotMob data if available
            const fotmobMotm = await fetchFotmobMotm(fotmobId);
            if (fotmobMotm && fotmobMotm.name) {
              const motmTeamNorm = normaliseName(fotmobMotm.teamName);
              const isHome =
                motmTeamNorm === normaliseName(enriched.home.name);
              const isAway =
                motmTeamNorm === normaliseName(enriched.away.name);
              const team = isHome ? "home" : isAway ? "away" : undefined;

              if (team) {
                enriched.motm = { name: fotmobMotm.name, team };

                // Propagate motm flag to the lineup player
                const fotmobNameNorm = normaliseName(fotmobMotm.name);
                const lineup = enriched.lineups[team];
                for (const p of lineup) {
                  if (normaliseName(p.name) === fotmobNameNorm) {
                    p.motm = true;
                    break;
                  }
                }
              }
            }
          }
        } catch {
          // Best-effort – fall back to computed ratings.
        }
      }
      return enriched;
    }
  }
  return match;
}

export { COMPETITION_SLUGS };
