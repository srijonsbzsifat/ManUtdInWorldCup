// API-Football (api-football.com) adapter - the premium data source.
// Activated when the API_FOOTBALL_KEY environment variable is set.
// Provides player ratings and more detailed statistics than the free ESPN feed.

import { fetchJson } from "@/lib/fetch";
import type { Match, PlayerTournamentStats } from "@/types";

const HOST = process.env.API_FOOTBALL_HOST ?? "v3.football.api-sports.io";

function isEnabled(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

async function request<T>(path: string, query: Record<string, any> = {}): Promise<T | null> {
  if (!isEnabled()) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `https://${HOST}/${path}?${qs.toString()}`;
  try {
    return await fetchJson<T>(url, {
      next: { revalidate: 60 },
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! },
    });
  } catch (err) {
    console.warn("API-Football request failed:", path, err);
    return null;
  }
}

export { isEnabled as apiFootballEnabled };

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
  };
  league: { id: number; name: string; country: string; logo: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

export async function getFixturesByDate(date: string, leagueId?: number) {
  return request<{ response: ApiFootballFixture[] }>("fixtures", { date, league: leagueId });
}

export async function getTeamFixtures(teamId: number, season: number, next?: number, last?: number) {
  return request<{ response: ApiFootballFixture[] }>("fixtures", { team: teamId, season, next, last });
}

export async function getFixtureLineups(fixtureId: number) {
  return request<{ response: any[] }>("fixtures/lineups", { fixture: fixtureId });
}

export async function getFixtureEvents(fixtureId: number) {
  return request<{ response: any[] }>("fixtures/events", { fixture: fixtureId });
}

export async function getFixtureStatistics(fixtureId: number) {
  return request<{ response: any[] }>("fixtures/statistics", { fixture: fixtureId });
}

export async function getPlayerStatistics(playerId: number, season: number) {
  return request<{ response: any[] }>("players", { id: playerId, season });
}

export function buildStatsFromApiFootball(
  data: any,
  playerId: string
): PlayerTournamentStats {
  const list: any[] = data?.response ?? [];
  const totals = {
    matches: 0,
    starts: 0,
    subs: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellow: 0,
    red: 0,
    ownGoals: 0,
    cleanSheets: 0,
    ratings: [] as number[],
    motm: 0,
    goalsConceded: 0,
    saves: 0,
  };

  for (const item of list) {
    const stats = item?.statistics ?? [];
    for (const s of stats) {
      const games = parseInt(s?.games?.appearences ?? 0) || 0;
      totals.matches += games;
      totals.starts += parseInt(s?.games?.lineups ?? 0) || 0;
      totals.minutes += (parseInt(s?.games?.minutes ?? 0) || 0) * games;
      totals.goals += parseInt(s?.goals?.total ?? 0) || 0;
      totals.assists += parseInt(s?.goals?.assists ?? 0) || 0;
      totals.yellow += parseInt(s?.cards?.yellow ?? 0) || 0;
      totals.red += parseInt(s?.cards?.red ?? 0) || 0;
      totals.ownGoals += 0;
      if (s?.games?.rating) {
        const r = parseFloat(s.games.rating);
        if (Number.isFinite(r)) totals.ratings.push(r);
      }
    }
  }

  const averageRating = totals.ratings.length
    ? totals.ratings.reduce((a, b) => a + b, 0) / totals.ratings.length
    : null;
  const bestRating = totals.ratings.length ? Math.max(...totals.ratings) : null;
  const worstRating = totals.ratings.length ? Math.min(...totals.ratings) : null;

  return {
    playerId,
    matches: totals.matches,
    starts: totals.starts,
    subs: Math.max(0, totals.matches - totals.starts),
    minutesPlayed: totals.minutes,
    goals: totals.goals,
    assists: totals.assists,
    cleanSheets: totals.cleanSheets,
    yellowCards: totals.yellow,
    redCards: totals.red,
    averageRating,
    ownGoals: totals.ownGoals,
    bestRating,
    worstRating,
    motmCount: totals.motm,
    goalsPerMatch: totals.matches ? totals.goals / totals.matches : 0,
    minutesPerGoal: totals.goals ? Math.round(totals.minutes / totals.goals) : null,
    goalsConceded: totals.goalsConceded ?? 0,
    saves: totals.saves ?? 0,
  };
}

export function emptyStats(playerId: string): PlayerTournamentStats {
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
