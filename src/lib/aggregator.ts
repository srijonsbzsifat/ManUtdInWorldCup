// Aggregators that combine our UnitedPlayers list with the match data
// returned by the data source adapters and produce per-player statistics.

import type {
  LineupPlayer,
  Match,
  PlayerMatchPerformance,
  PlayerTournamentStats,
} from "@/types";
import { UNITED_PLAYERS, matchUnitedPlayer, normaliseName } from "@/lib/players";

/* -------------------------------------------------------------------------- */
/* Single source of truth - we compute everything from Match[]                */
/* -------------------------------------------------------------------------- */

function emptyStats(playerId: string): PlayerTournamentStats {
  return {
    playerId,
    matches: 0,
    starts: 0,
    subs: 0,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    averageRating: null,
    ownGoals: 0,
    bestRating: null,
    worstRating: null,
    motmCount: 0,
    goalsPerMatch: 0,
    minutesPerGoal: null,
    goalsConceded: 0,
    saves: 0,
  };
}

function isOurPlayer(p: LineupPlayer): p is LineupPlayer & { unitedPlayerId: string } {
  return Boolean(p?.unitedPlayerId);
}

/**
 * Walk through a list of matches and collect per-United-player stats.
 * Only matches that have a complete lineup/boxscore (i.e. status FINISHED or
 * IN_PLAY with lineups available) are considered.
 */
export function computeTournamentStats(
  matches: Match[]
): Record<string, PlayerTournamentStats> {
  const statsByPlayer: Record<string, PlayerTournamentStats> = {};
  for (const p of UNITED_PLAYERS) statsByPlayer[p.id] = emptyStats(p.id);

  for (const match of matches) {
    if (!match.lineups) continue;
    if (!["FINISHED", "IN_PLAY", "PAUSED"].includes(match.status)) continue;
    // Compute the team-level clean-sheet flag once per side so the GK and
    // defenders can be credited correctly (we deliberately do NOT rely on
    // ESPN's per-player `goalsConceded` because it reflects goals conceded
    // while the player was on the pitch, not the team's final clean sheet).
    const homeCleanSheet = (match.score.away ?? 0) === 0;
    const awayCleanSheet = (match.score.home ?? 0) === 0;
    processLineup(match.lineups.home, "home", match, statsByPlayer, homeCleanSheet);
    processLineup(match.lineups.away, "away", match, statsByPlayer, awayCleanSheet);
  }

  // Compute derived metrics.
  for (const id of Object.keys(statsByPlayer)) {
    const s = statsByPlayer[id];
    s.goalsPerMatch = s.matches ? +(s.goals / s.matches).toFixed(2) : 0;
    s.minutesPerGoal = s.goals ? Math.round(s.minutesPlayed / s.goals) : null;
  }

  return statsByPlayer;
}

function processLineup(
  lineup: LineupPlayer[],
  side: "home" | "away",
  match: Match,
  statsByPlayer: Record<string, PlayerTournamentStats>,
  teamCleanSheet: boolean
) {
  for (const player of lineup) {
    if (!isOurPlayer(player)) continue;
    // Skip players who never actually came on - squad players who are named
    // on the bench but don't enter the game should not be credited with an
    // appearance, a rating, or any match-level stats.
    const mins = player.minutesPlayed ?? 0;
    if (mins <= 0 && !player.starter) continue;
    const stats = statsByPlayer[player.unitedPlayerId];
    stats.matches += 1;
    if (player.starter) stats.starts += 1;
    else stats.subs += 1;
    stats.minutesPlayed += mins;
    stats.goals += player.goals ?? 0;
    stats.assists += player.assists ?? 0;
    stats.yellowCards += player.yellowCards ?? 0;
    stats.redCards += player.redCards ?? 0;
    stats.ownGoals += player.ownGoals ?? 0;
    // Goalkeeper-specific totals - goalsConceded reflects the team total on
    // this side, not the per-player value, so we feed the score through.
    stats.goalsConceded += side === "home" ? (match.score.away ?? 0) : (match.score.home ?? 0);
    stats.saves += player.saves ?? 0;
    // Award a clean sheet at the team level.  GKs only get credit if they
    // actually played at least one minute (no credit for unused subs);
    // outfield players get credit for playing a meaningful share of the
    // match.
    if (teamCleanSheet) {
      const isGk = player.position === "GK";
      if ((isGk && mins > 0) || (!isGk && mins >= 60)) {
        stats.cleanSheets += 1;
      }
    }
    if (player.rating !== null && player.rating !== undefined) {
      if (stats.averageRating === null) stats.averageRating = player.rating;
      else stats.averageRating = (stats.averageRating * (stats.matches - 1) + player.rating) / stats.matches;
      if (stats.bestRating === null || player.rating > stats.bestRating) stats.bestRating = player.rating;
      if (stats.worstRating === null || player.rating < stats.worstRating) stats.worstRating = player.rating;
    }
    if (match.motm && side === match.motm.team && normaliseName(match.motm.name) === normaliseName(player.name)) {
      stats.motmCount += 1;
    }
  }
}

/**
 * Build a flat performance list (one row per Man Utd player appearance)
 * to power the "Recent matches" view on player detail pages.
 */
export function computePlayerPerformances(
  matches: Match[],
  playerId: string
): PlayerMatchPerformance[] {
  const out: PlayerMatchPerformance[] = [];
  for (const match of matches) {
    if (!match.lineups) continue;
    const all = [...match.lineups.home, ...match.lineups.away];
    const own = all.find((p) => p.unitedPlayerId === playerId);
    if (!own) continue;
    // Skip squad players who never actually came on - bench players without
    // a single minute don't get a "Match-by-match" entry.
    const mins = own.minutesPlayed ?? 0;
    if (mins <= 0 && !own.starter) continue;

    const ownSide = match.lineups.home.find((p) => p.unitedPlayerId === playerId) ? "home" : "away";
    const opponent = ownSide === "home" ? match.away : match.home;
    const result: PlayerMatchPerformance["result"] =
      match.status !== "FINISHED"
        ? "TBD"
        : ownSide === "home"
        ? (match.score.home ?? 0) > (match.score.away ?? 0)
          ? "W"
          : (match.score.home ?? 0) < (match.score.away ?? 0)
          ? "L"
          : "D"
        : (match.score.away ?? 0) > (match.score.home ?? 0)
          ? "W"
          : (match.score.away ?? 0) < (match.score.home ?? 0)
          ? "L"
          : "D";

    out.push({
      match,
      player: own,
      opponent,
      result,
      score: `${match.score.home ?? 0}-${match.score.away ?? 0}`,
      competition: match.competition.name,
    });
  }
  return out;
}

/** Top scorers / top rated players for a leaderboard widget. */
export function topPerformers(
  stats: Record<string, PlayerTournamentStats>,
  sortBy: "goals" | "assists" | "averageRating" | "minutesPlayed" | "cleanSheets" = "goals",
  limit = 5
) {
  return Object.values(stats)
    .filter((s) => s.matches > 0)
    .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number))
    .slice(0, limit);
}

export function findUnitedPlayersInLineup(lineup: LineupPlayer[]): LineupPlayer[] {
  return lineup.filter((p) => isOurPlayer(p));
}
