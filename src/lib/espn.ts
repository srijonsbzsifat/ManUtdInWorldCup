import { fetchJson } from "@/lib/fetch";
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
import { fetchFotmobMatchData, fetchFotmobMatchId, applyFotmobRatings, applyFotmobPositions } from "@/lib/fotmob";

/* -------------------------------------------------------------------------- */
/* ESPN public API adapter                                                    */
/* -------------------------------------------------------------------------- */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";

/** Competitions we care about - the World Cup, qualifying, and friendlies.
 *  Filtered to ONLY the confederations our United players' national teams
 *  participate in (UEFA, CONMEBOL, CAF).  Dropping CONCACAF, AFC, and OFC
 *  saves 3 redundant HTTP requests per scoreboard fetch.
 *
 *  Current nations represented: TUR, BEL (UEFA), MAR, CIV (CAF),
 *  ARG, BRA, URU (CONMEBOL), POR, ENG, SCO (UEFA).
 */
const COMPETITION_SLUGS = [
  { slug: "fifa.world", matchType: "world_cup" as const, name: "FIFA World Cup" },
  { slug: "fifa.friendly", matchType: "friendly" as const, name: "International Friendly" },
  { slug: "fifa.wcq.uefa", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Europe" },
  { slug: "fifa.wcq.conmebol", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - South America" },
  { slug: "fifa.wcq.caf", matchType: "world_cup_qualifier" as const, name: "WC Qualifying - Africa" },
];

/* -------------------------------------------------------------------------- */
/* Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

function mapStatus(raw: any): { status: MatchStatus; minute: number | string | null; stoppage?: number } {
  // Accept either the full status object or just `status.type`.
  const type = raw?.type ?? raw;
  const state = String(type?.state ?? type?.name ?? "").toUpperCase();
  const id = String(type?.id ?? "").toUpperCase();
  const description = String(type?.description ?? "").toLowerCase();
  const detail = String(type?.detail ?? "").toLowerCase();
  const shortDetail = String(type?.shortDetail ?? "").toLowerCase();

  let status: MatchStatus = "SCHEDULED";
  if (state === "PRE" || id === "1" || id === "0") status = "SCHEDULED";
  else if (state === "IN" || id === "2") status = "IN_PLAY";
  else if (state === "POST" || id === "3") status = "FINISHED";
  else if (description.includes("postponed") || detail.includes("postponed")) status = "POSTPONED";
  else if (description.includes("suspended")) status = "SUSPENDED";
  else if (description.includes("canceled") || description.includes("cancelled")) status = "CANCELED";
  else if (description.includes("halftime") || detail.includes("halftime") || shortDetail.includes("ht")) status = "PAUSED";

  // Extract current minute (and any stoppage time) if available.
  let minute: number | string | null = null;
  let stoppage: number | undefined;
  if (status === "IN_PLAY" || status === "PAUSED") {
    if (status === "PAUSED") minute = "HT";
    else {
      // The stoppage-bearing clock string (e.g. "45'+3'") lives on the parent
      // status object; fall back to type fields. Avoid the numeric clock here.
      const clockStr = raw?.displayClock ?? type?.displayClock ?? type?.shortDetail ?? type?.detail;
      const base = parseClockMinute(clockStr);
      if (base !== null) minute = base;
      else if (typeof raw?.clock === "number") minute = raw.clock;
      else if (typeof type?.clock === "number") minute = type.clock;
      const stop = parseStoppage(clockStr);
      if (stop && stop > 0) stoppage = stop;
    }
  } else if (status === "FINISHED") {
    minute = "FT";
  }

  return { status, minute, stoppage };
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
  slug: string = "fifa.world",
  isLive: boolean = false,
  isFinished: boolean = false
): Promise<EspnSummary | null> {
  try {
    const url = `${ESPN_BASE}/${slug}/summary?event=${eventId}`;
    // Different revalidation strategies by match state:
    //   - Live:        15s  (score/minute changes every few seconds)
    //   - Scheduled:   60s  (lineups may appear, otherwise static)
    //   - Finished:    600s (10 min – boxscore never changes, but we
    //                        still serve data quickly on cold starts)
    const revalidate = isLive ? 15 : isFinished ? 600 : 60;
    return await fetchJson<EspnSummary>(url, { next: { revalidate } });
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

  const { status, minute, stoppage } = mapStatus(competition.status);

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
    stoppage,
    home: mapTeam(home.team, "home"),
    away: mapTeam(away.team, "away"),
    score: { home: parseScore(home.score), away: parseScore(away.score) },
    venue: competition.venue?.fullName,
    city: competition.venue?.address?.city,
    matchType: fallback.matchType,
    espnSlug: fallback.slug,
    events: mapEvents(summary, home.team?.id, away.team?.id, { home: parseScore(home.score), away: parseScore(away.score) }),
    lineups: mapLineups(summary, home.team?.id, away.team?.id, status, minute),
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

  const getSortKey = (p: any) => {
    const min = parseClockMinute(p?.clock) ?? 0;
    const stop = parseStoppage(p?.clock) ?? 0;
    return min * 1000 + stop;
  };

  const sortedEvents = [...allEvents].sort((a, b) => getSortKey(a) - getSortKey(b));
  const seenKeys = new Set<string>();
  let runningScore = { home: 0, away: 0 };

  for (const play of sortedEvents) {
    // Handle both formats: plays (type.text/type.abbreviation) and details (scoringPlay/redCard flags)
    const isDetailFormat = play?.scoringPlay !== undefined || play?.redCard !== undefined;
    let type = "";
    if (isDetailFormat) {
      if (play.ownGoal) type = "own_goal";
      else if (play.scoringPlay) type = "goal";
      else if (play.redCard) type = "red_card";
      else if (play.penaltyKick) {
        type = "penalty";
      }
    } else {
      type = String(play?.type?.text ?? play?.type?.abbreviation ?? "").toLowerCase();
    }

    const teamId = play?.team?.id;
    const team: "home" | "away" = String(teamId) === String(homeTeamId) ? "home" : "away";
    const minute = parseClockMinute(play?.clock);
    const stoppage = parseStoppage(play?.clock);
    const minVal = minute ?? 0;
    const stopVal = stoppage ?? 0;

    if (type.includes("kickoff") && !play?.scoringPlay) {
      const eventKey = `kickoff-${minVal}-${stopVal}-${team}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-ko`),
        minute: minVal,
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

      const scorerName = scorer ? safeName(scorer) : "";
      const eventKey = `goal-${minVal}-${stopVal}-${team}-${scorerName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      if (team === "home") runningScore.home += 1;
      else runningScore.away += 1;

      events.push({
        id: String(play?.id ?? `evt-${minute}-goal`),
        minute: minVal,
        stoppage,
        type: isDetailFormat && play.ownGoal ? "own_goal" : "goal",
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

      const scorerName = scorer ? safeName(scorer) : "";
      const eventKey = `penalty_scored-${minVal}-${stopVal}-${team}-${scorerName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      if (team === "home") runningScore.home += 1;
      else runningScore.away += 1;

      events.push({
        id: String(play?.id ?? `evt-${minute}-pen`),
        minute: minVal,
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

    // Check for penalty saved (goalkeeper saved a penalty)
    if ((type.includes("penalty") && !play?.scoringPlay) || (isDetailFormat && play.penaltyKick && !play.scoringPlay)) {
      const pPlayer = play?.participants?.[0];
      const pPlayerName = pPlayer ? safeName(pPlayer) : "";
      const eventKey = `penalty_saved-${minVal}-${stopVal}-${team}-${pPlayerName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-pensave`),
        minute: minVal,
        stoppage,
        type: "penalty_saved",
        team,
        player: pPlayer
          ? { id: String(pPlayer.athlete?.id ?? ""), name: safeName(pPlayer) }
          : undefined,
        detail: "Penalty saved",
      });
      continue;
    }

    if (type.includes("miss") && type.includes("penalty")) {
      const pPlayer = play?.participants?.[0];
      const pPlayerName = pPlayer ? safeName(pPlayer) : "";
      const eventKey = `penalty_missed-${minVal}-${stopVal}-${team}-${pPlayerName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-pmiss`),
        minute: minVal,
        stoppage,
        type: "penalty_missed",
        team,
        player: pPlayer
          ? { id: String(pPlayer.athlete?.id ?? ""), name: safeName(pPlayer) }
          : undefined,
        detail: "Penalty missed",
      });
      continue;
    }

    if (type.includes("yellow") || (isDetailFormat && play.yellowCard)) {
      const participants = play?.participants ?? [];
      const player = isDetailFormat ? participants[0] : participants[0];
      const pName = player ? safeName(player) : "";
      const eventKey = `yellow_card-${minVal}-${stopVal}-${team}-${pName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-yc`),
        minute: minVal,
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
      const pName = player ? safeName(player) : "";
      const eventKey = `red_card-${minVal}-${stopVal}-${team}-${pName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-rc`),
        minute: minVal,
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
      const inName = inP ? safeName(inP) : "";
      const outName = outP ? safeName(outP) : "";
      const eventKey = `substitution-${minVal}-${stopVal}-${team}-${inName}-${outName}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-sub`),
        minute: minVal,
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
      // Period breaks fire at 45' (HT), 90' (FT in regulation), 105' (extra-time
      // half-time) and 120' (FT after extra time).  Treat 45' and ~105' as
      // half-time breaks; everything else (90', 120') is full time.  Using
      // `<= 45` alone mislabelled the end of the first extra-time period as FT.
      const isHalfTimeBreak = minVal <= 45 || (minVal > 90 && minVal <= 105);
      const eventKey = `period-${isHalfTimeBreak ? "half_time" : "full_time"}-${minVal}-${stopVal}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);

      events.push({
        id: String(play?.id ?? `evt-${minute}-ht`),
        minute: minVal || (isHalfTimeBreak ? 45 : 90),
        type: isHalfTimeBreak ? "half_time" : "full_time",
        team: "home",
        detail: isHalfTimeBreak ? "Half time" : "Full time",
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
  awayTeamId: any,
  matchStatus?: MatchStatus,
  liveMinute?: number | string | null
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

  // For live matches, starters should be credited with the actual elapsed
  // time, not the full 90 minutes.  Resolve the current clock minute here
  // so every player in the roster loop can use the same value.
  const isLive = matchStatus === "IN_PLAY" || matchStatus === "PAUSED";
  let liveElapsed: number | null = null;
  if (isLive) {
    if (typeof liveMinute === "number" && liveMinute > 0) {
      liveElapsed = liveMinute;
    } else if (liveMinute === "HT") {
      liveElapsed = 45;
    }
  }

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

      const minutes = computeMinutesPlayed(
        starter,
        subOnMinute,
        subOffMinute,
        liveElapsed ?? getMatchDuration(summary)
      );
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
        penaltySaves: stats.penaltySaves,
        penaltyMisses: stats.penaltyMisses,
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

  // Defensively drop exact duplicate athlete entries (same id) the feed may
  // emit. Note: a *phantom extra starting keeper* (a distinct athlete id with a
  // GK position) is a different ESPN glitch handled at render time in PitchView.
  const dedupeById = (players: LineupPlayer[]): LineupPlayer[] => {
    const seen = new Set<string>();
    return players.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  };

  return { home: dedupeById(home), away: dedupeById(away) };
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

export function computeMinutesPlayed(
  starter: boolean,
  subOn: number | null,
  subOff: number | null,
  matchDuration: number = 90
): number {
  if (starter && subOff == null) return matchDuration;
  if (starter && subOff != null) return subOff;
  // Sub who came on and was later subbed off again (injury/tactical/red card):
  // credit only the window they were actually on the pitch.
  if (!starter && subOn != null && subOff != null) return Math.max(0, subOff - subOn);
  if (!starter && subOn != null) return Math.max(0, matchDuration - subOn);
  return 0;
}

function getMatchDuration(summary: EspnSummary): number {
  const candidates = [
    ...(summary?.plays ?? []),
    ...(summary?.header?.competitions?.[0]?.details ?? []),
  ];

  let duration = 90;
  for (const item of candidates) {
    const type = String(item?.type?.text ?? item?.type?.abbreviation ?? "").toLowerCase();
    const minute = parseClockMinute(item?.clock);
    if (
      minute !== null &&
      minute > duration &&
      (type.includes("full") || type.includes("end of period") || type.includes("half"))
    ) {
      duration = minute;
    }
  }
  return duration;
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
  goals: number | undefined;
  assists: number | undefined;
  yellowCards: number | undefined;
  redCards: number | undefined;
  ownGoals: number | undefined;
  goalsConceded: number | undefined;
  saves: number | undefined;
  cleanSheet: boolean | undefined;
  penaltySaves: number | undefined;
  penaltyMisses: number | undefined;
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

  const toNum = (s: any) => {
    if (s === null || s === undefined) return undefined;
    const parsed = parseFloat(String(s));
    return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
  };

  const goals = toNum(findName("totalGoals")?.value ?? findRe(/^goals?$/i)?.value);
  const assists = toNum(findName("goalAssists")?.value ?? findRe(/^assists?$/i)?.value);
  const yellowCards = toNum(findName("yellowCards")?.value);
  const redCards = toNum(findName("redCards")?.value);
  const ownGoals = toNum(findName("ownGoals")?.value);
  const goalsConceded = toNum(findName("goalsConceded")?.value);
  const saves = toNum(findName("saves")?.value);
  const penaltySaves = toNum(findName("penaltySaves")?.value ?? findRe(/penaltySaves|penaltiesSaved/i)?.value);
  const penaltyMisses = toNum(findName("penaltyMisses")?.value ?? findRe(/penaltyMisses|penaltiesMissed/i)?.value);
  // Don't infer clean sheets at the per-player level - ESPN's per-player
  // goalsConceded reflects what the team conceded while this player was on
  // the pitch, not whether the team ended with a clean sheet.  Awarding a
  // clean sheet to a sub who came on at 1-0 just because the team didn't
  // concede again is misleading.  The aggregator decides who gets a clean
  // sheet by comparing the final team score.
  const cleanSheet = Boolean(findName("cleanSheet")?.value) || undefined;

  return { goals, assists, yellowCards, redCards, ownGoals, goalsConceded, saves, cleanSheet, penaltySaves, penaltyMisses };
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
    // 15s revalidate ensures live match scoreboard data (minute/score/status)
    // stays fresh across all consumers: live page, matches listing, match detail
    payload = await fetchJson<any>(url, { next: { revalidate: 15 }, silent4xx: true });
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
    const { status, minute, stoppage } = mapStatus(comp.status);

    matches.push({
      id: String(evt.id ?? comp.id),
      competition: { id: String(comp.id ?? evt.id), name },
      kickoff: evt.date ?? comp.date,
      status,
      minute,
      stoppage,
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
/* Per-competition timeout wrapper & failure cache                            */
/* -------------------------------------------------------------------------- */

/**
 * If a competition slug fails to fetch (e.g. CAF times out), we cache the
 * failure so we skip it for a while instead of hanging on every request.
 * Keyed by slug, value is the timestamp until which we should skip it.
 */
const competitionFailureCache = new Map<string, number>();
const COMPETITION_FAILURE_TTL_MS = 30 * 60 * 1000; // 30 min — dead qualifier endpoints won't recover fast
const COMPETITION_FAILURE_MAX_SIZE = 20;

/** Evict stale entries and enforce max size. */
function evictCompetitionFailureCache(): void {
  const now = Date.now();
  for (const [key, expiry] of competitionFailureCache.entries()) {
    if (now >= expiry) competitionFailureCache.delete(key);
  }
  if (competitionFailureCache.size > COMPETITION_FAILURE_MAX_SIZE) {
    const toDelete = competitionFailureCache.size - COMPETITION_FAILURE_MAX_SIZE;
    let i = 0;
    for (const key of competitionFailureCache.keys()) {
      if (i >= toDelete) break;
      competitionFailureCache.delete(key);
      i++;
    }
  }
}

/**
 * Wrap a competition fixture fetch with a per-competition timeout so that
 * one slow ESPN endpoint (e.g. CAF African qualifiers) cannot block the
 * entire fixtures response for more than a few seconds.
 *
 * Since listCompetitionFixtures already uses fetchJson with its own timeout,
 * this is an additional safety net: we race the real fetch against a timeout
 * so that Promise.allSettled in fetchAllFixtures doesn't get stuck on one
 * sluggish endpoint.
 */
// Clean failure cache periodically
evictCompetitionFailureCache();

async function fetchCompetitionWithTimeout(
  slug: string,
  matchType: Match["matchType"],
  name: string,
  dateRange?: { start: Date; end: Date },
  timeoutMs: number = 3_000
): Promise<Match[]> {
  // Skip if this competition is in the failure cache and hasn't expired
  const failureUntil = competitionFailureCache.get(slug);
  if (failureUntil && Date.now() < failureUntil) {
    console.warn(`espn: skipping known-failing competition slug "${slug}" (failure cache)`);
    return [];
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      listCompetitionFixtures(slug, matchType, name, dateRange),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timeout: "${slug}" exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
    return result;
  } catch (err: any) {
    console.warn(`espn: competition "${slug}" failed or timed out — skipping`, err?.message ?? err);
    // Cache the failure so subsequent requests skip it for a while
    competitionFailureCache.set(slug, Date.now() + COMPETITION_FAILURE_TTL_MS);
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

const WC_TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");

/**
 * The competition slugs worth fetching right now.  Once the tournament is
 * underway, qualifiers are finished — their ESPN endpoints hang rather than
 * returning empty, burning the full timeout budget on every cold request — so
 * we drop them during the WC period.
 */
function activeCompetitionSlugs(): typeof COMPETITION_SLUGS {
  const duringTournament = Date.now() >= WC_TOURNAMENT_START.getTime();
  return duringTournament
    ? COMPETITION_SLUGS.filter((c) => c.matchType !== "world_cup_qualifier")
    : COMPETITION_SLUGS;
}

export async function fetchAllFixtures(
  options: FetchFixturesOptions = {}
): Promise<Match[]> {
  evictCompetitionFailureCache();

  const competitionsToFetch = activeCompetitionSlugs();

  const all: Match[] = [];
  const seen = new Set<string>();
  const settled = await Promise.allSettled(
    competitionsToFetch.map((c) =>
      fetchCompetitionWithTimeout(c.slug, c.matchType, c.name, options.dateRange)
    )
  );
  for (const result of settled) {
    if (result.status === "rejected") continue;
    const fixtures = result.value;
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

/**
 * Fully-enriched FINISHED matches never change — their lineups, ratings, events
 * and MOTM are fixed once the game ends.  Cache the assembled Match by id so the
 * stats and player-detail aggregations (which re-hydrate the same finished
 * fixtures on every request) skip the ESPN summary fetch, the FotMob scrape, and
 * all the mapping work.
 */
const ENRICHED_FINISHED_TTL_MS = 60 * 60 * 1000; // 1 hour
const ENRICHED_FINISHED_MAX = 100;
const enrichedFinishedCache = new Map<string, { exp: number; match: Match }>();

function getEnrichedFinished(id: string): Match | undefined {
  const e = enrichedFinishedCache.get(id);
  if (!e) return undefined;
  if (Date.now() > e.exp) {
    enrichedFinishedCache.delete(id);
    return undefined;
  }
  return e.match;
}

function setEnrichedFinished(id: string, match: Match): void {
  enrichedFinishedCache.set(id, { exp: Date.now() + ENRICHED_FINISHED_TTL_MS, match });
  if (enrichedFinishedCache.size > ENRICHED_FINISHED_MAX) {
    let i = 0;
    const drop = enrichedFinishedCache.size - ENRICHED_FINISHED_MAX;
    for (const k of enrichedFinishedCache.keys()) {
      if (i >= drop) break;
      enrichedFinishedCache.delete(k);
      i++;
    }
  }
}

export async function fetchMatchDetails(match: Match): Promise<Match> {
  const slug = match.espnSlug ?? "fifa.friendly";
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED";

  // Finished matches are immutable — serve the enriched copy if we have one.
  if (isFinished) {
    const cached = getEnrichedFinished(match.id);
    if (cached) return cached;
  }

  // Step 1: Kick off both ESPN summary and FotMob lookup in parallel.
  // FotMob lookup depends only on team names and date, not on lineups, so
  // start it unconditionally — the apply step below guards on enriched.lineups.
  const fotmobPromise = fetchFotmobMatchId(match.kickoff, match.home.name, match.away.name).catch(() => null);

  const summaryPromise = getMatchSummary(match.id, slug, isLive, isFinished);

  const [fotmobId, summary] = await Promise.all([fotmobPromise, summaryPromise]);

  if (!summary) return match;

  const detailed = summaryToMatch(summary, {
    slug,
    matchType: match.matchType,
    name: match.competition.name,
  });
  if (!detailed) return match;

  const enriched = { ...match, ...detailed, id: match.id };

  // Step 2: Apply FotMob ratings / formations if we got an ID and lineups exist.
  if (fotmobId && enriched)
    try {
      // For live/in-play matches, bypass the 24h FotMob cache so ratings and
      // MOTM refresh as the game progresses; finished matches use the cache.
      const fotmobData = await fetchFotmobMatchData(fotmobId, isLive);
      if (fotmobData && enriched.lineups) {
        if (fotmobData.ratings) {
          enriched.lineups = {
            home: applyFotmobRatings(enriched.lineups.home, fotmobData.ratings),
            away: applyFotmobRatings(enriched.lineups.away, fotmobData.ratings),
          };
        }
        if (fotmobData.formation) {
          enriched.lineups = {
            home: applyFotmobPositions(enriched.lineups.home, fotmobData.lineup?.home, fotmobData.formation.home),
            away: applyFotmobPositions(enriched.lineups.away, fotmobData.lineup?.away, fotmobData.formation.away),
          };
        }
        if (fotmobData.formation) {
          enriched.formation = fotmobData.formation;
        }
      }

      // Override MOTM with FotMob data if available
      const fotmobMotm = fotmobData?.motm;
      if (fotmobMotm && fotmobMotm.name) {
        const motmTeamNorm = normaliseName(fotmobMotm.teamName);
        const isHome = motmTeamNorm === normaliseName(enriched.home.name);
        const isAway = motmTeamNorm === normaliseName(enriched.away.name);
        const team = isHome ? "home" : isAway ? "away" : undefined;

        if (team) {
          enriched.motm = { name: fotmobMotm.name, team };

          // Propagate motm flag to the lineup player
          if (enriched.lineups) {
            const fotmobNameNorm = normaliseName(fotmobMotm.name);
            const lineup = enriched.lineups[team];
            if (lineup) {
              for (const p of lineup) {
                if (normaliseName(p.name) === fotmobNameNorm) {
                  p.motm = true;
                  break;
                }
              }
            }
          }
        }
      }
    } catch {
      // Best-effort – fall back to computed ratings.
    }

  // Cache the immutable finished result (only once it actually has lineups).
  if (isFinished && enriched.lineups) {
    setEnrichedFinished(match.id, enriched);
  }

  return enriched;
}

export { COMPETITION_SLUGS };

/* -------------------------------------------------------------------------- */
/* Direct match summary by ID – skip the scoreboard waterfall                 */
/* -------------------------------------------------------------------------- */

/** In-memory cache: ESPN event ID → competition slug that has this match. */
const matchSlugCache = new Map<string, string>();

/**
 * Fetch a match's full summary directly by its event ID, trying
 * competition slugs in priority order.  Once a slug is found for an ID
 * it is cached so subsequent lookups are instant.
 *
 * @param eventId   ESPN event (competition) ID
 * @param knownSlug If you already know the slug (e.g. from the matches list),
 *                  pass it here to skip the trial-and-error loop entirely.
 */
export async function fetchMatchDetailsById(
  eventId: string,
  knownSlug?: string
): Promise<Match | null> {
  // 1. Try the known slug first (fast path – from matches list or cache).
  //    Otherwise fall back to the active slugs only (skips dead qualifier
  //    endpoints that hang during the tournament).
  const candidates = knownSlug
    ? [knownSlug]
    : [matchSlugCache.get(eventId), ...activeCompetitionSlugs().map((c) => c.slug)].filter(
      (s): s is string => !!s
    );

  const seen = new Set<string>();
  for (const slug of candidates) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const summary = await getMatchSummary(eventId, slug);
    if (!summary) continue;
    const comp = COMPETITION_SLUGS.find((c) => c.slug === slug);
    const match = summaryToMatch(summary, comp ?? { slug, matchType: "other", name: "International Match" });
    if (match) {
      // Cache the slug for next time (even if we got it from knownSlug).
      matchSlugCache.set(eventId, slug);
      return match;
    }
  }
  return null;
}
