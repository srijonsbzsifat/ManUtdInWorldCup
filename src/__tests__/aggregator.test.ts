import { describe, it, expect } from "vitest";
import { computeTournamentStats, getStatsScope } from "@/lib/aggregator";
import type { Match, LineupPlayer, MatchEvent } from "@/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<LineupPlayer> & { unitedPlayerId: string }): LineupPlayer {
  return {
    id: overrides.unitedPlayerId,
    name: overrides.name ?? "Test Player",
    shirtNumber: 1,
    position: overrides.position ?? "MF",
    starter: overrides.starter ?? true,
    minutesPlayed: overrides.minutesPlayed ?? 90,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> & { homeLineup?: LineupPlayer[]; awayLineup?: LineupPlayer[] }): Match {
  const { homeLineup, awayLineup, ...rest } = overrides;
  return {
    id: "match-1",
    competition: { id: "wc", name: "World Cup" },
    kickoff: "2026-06-12T18:00:00Z",
    status: "FINISHED",
    minute: null,
    matchType: "world_cup",
    espnSlug: "fifa.world",
    home: { id: "eng", name: "England", shortName: "ENG", code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#ffffff" },
    away: { id: "usa", name: "USA", shortName: "USA", code: "USA", flag: "🇺🇸", color: "#002868" },
    score: { home: 2, away: 1 },
    events: [],
    lineups: homeLineup || awayLineup
      ? {
          home: homeLineup ?? [],
          away: awayLineup ?? [],
        }
      : undefined,
    ...rest,
  };
}

// ── getStatsScope ─────────────────────────────────────────────────────────────

describe("getStatsScope", () => {
  it("returns world_cup because today is after 2026-06-11", () => {
    // Today is 2026-06-13 per memory context
    expect(getStatsScope()).toBe("world_cup");
  });
});

// ── computeTournamentStats ────────────────────────────────────────────────────

describe("computeTournamentStats", () => {
  it("returns zero stats for a player with no appearances", () => {
    const stats = computeTournamentStats([]);
    // dalot is in UNITED_PLAYERS
    expect(stats["dalot"].matches).toBe(0);
    expect(stats["dalot"].goals).toBe(0);
  });

  it("skips matches without lineups", () => {
    const match = makeMatch({ homeLineup: undefined, awayLineup: undefined });
    const stats = computeTournamentStats([match]);
    expect(stats["bruno"].matches).toBe(0);
  });

  it("skips non-world_cup matches when scope is world_cup", () => {
    const player = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes" });
    const match = makeMatch({ matchType: "friendly", homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["bruno"].matches).toBe(0);
  });

  it("accumulates goals and assists", () => {
    const player = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes", goals: 2, assists: 1 });
    const match = makeMatch({ homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["bruno"].goals).toBe(2);
    expect(stats["bruno"].assists).toBe(1);
    expect(stats["bruno"].matches).toBe(1);
    expect(stats["bruno"].starts).toBe(1);
  });

  it("counts substitute appearance correctly", () => {
    const player = makePlayer({
      unitedPlayerId: "mainoo",
      name: "Kobbie Mainoo",
      starter: false,
      subOnMinute: 60,
      minutesPlayed: 30,
    });
    const match = makeMatch({ homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["mainoo"].matches).toBe(1);
    expect(stats["mainoo"].starts).toBe(0);
    expect(stats["mainoo"].subs).toBe(1);
    expect(stats["mainoo"].minutesPlayed).toBe(30);
  });

  it("counts actual elapsed minutes for a live match, not 90", () => {
    const player = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes", minutesPlayed: 10 });
    const match = makeMatch({ status: "IN_PLAY", minute: 10, homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    // minutesPlayed comes from the lineup player we constructed — the aggregator
    // sums whatever the ESPN adapter already computed, so we test that the value
    // is correctly forwarded (the adapter fix prevents it being 90).
    expect(stats["bruno"].minutesPlayed).toBe(10);
  });

  it("skips bench player who never came on (0 mins, not a starter)", () => {
    const player = makePlayer({
      unitedPlayerId: "mainoo",
      name: "Kobbie Mainoo",
      starter: false,
      minutesPlayed: 0,
    });
    const match = makeMatch({ homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["mainoo"].matches).toBe(0);
  });

  it("awards clean sheet to GK who played any minutes", () => {
    const gk = makePlayer({ unitedPlayerId: "bayindir", name: "Altay Bayindir", position: "GK", minutesPlayed: 90 });
    // home score = 1, away score = 0 → home team has clean sheet
    const match = makeMatch({ score: { home: 1, away: 0 }, homeLineup: [gk] });
    const stats = computeTournamentStats([match]);
    expect(stats["bayindir"].cleanSheets).toBe(1);
  });

  it("does not award clean sheet to GK with 0 minutes (unused sub)", () => {
    const gk = makePlayer({ unitedPlayerId: "bayindir", name: "Altay Bayindir", position: "GK", starter: false, minutesPlayed: 0 });
    const match = makeMatch({ score: { home: 1, away: 0 }, homeLineup: [gk] });
    const stats = computeTournamentStats([match]);
    expect(stats["bayindir"].cleanSheets).toBe(0);
  });

  it("awards clean sheet to outfield player with 60+ minutes", () => {
    const player = makePlayer({ unitedPlayerId: "dalot", name: "Diogo Dalot", position: "RB", minutesPlayed: 60 });
    const match = makeMatch({ score: { home: 1, away: 0 }, homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["dalot"].cleanSheets).toBe(1);
  });

  it("does not award clean sheet to outfield player with < 60 minutes", () => {
    const player = makePlayer({ unitedPlayerId: "dalot", name: "Diogo Dalot", position: "RB", minutesPlayed: 59 });
    const match = makeMatch({ score: { home: 1, away: 0 }, homeLineup: [player] });
    const stats = computeTournamentStats([match]);
    expect(stats["dalot"].cleanSheets).toBe(0);
  });

  it("averages ratings and tracks best/worst", () => {
    const p1 = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes", rating: 8.0 });
    const p2 = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes", rating: 6.0 });
    const m1 = makeMatch({ id: "m1", homeLineup: [p1] });
    const m2 = makeMatch({ id: "m2", homeLineup: [p2] });
    const stats = computeTournamentStats([m1, m2]);
    expect(stats["bruno"].averageRating).toBe(7.0);
    expect(stats["bruno"].bestRating).toBe(8.0);
    expect(stats["bruno"].worstRating).toBe(6.0);
  });

  it("counts MOTM", () => {
    const player = makePlayer({ unitedPlayerId: "bruno", name: "Bruno Fernandes" });
    const match = makeMatch({
      homeLineup: [player],
      motm: { name: "Bruno Fernandes", team: "home" },
    });
    const stats = computeTournamentStats([match]);
    expect(stats["bruno"].motmCount).toBe(1);
  });

  describe("GK goals conceded", () => {
    it("counts conceded goals while starter is on pitch using events", () => {
      const gk = makePlayer({ unitedPlayerId: "bayindir", name: "Altay Bayindir", position: "GK", minutesPlayed: 90 });
      const events: MatchEvent[] = [
        { id: "g1", minute: 30, type: "goal", team: "away", player: { name: "Scorer" } },
        { id: "g2", minute: 70, type: "goal", team: "away", player: { name: "Scorer" } },
      ];
      const match = makeMatch({ score: { home: 0, away: 2 }, homeLineup: [gk], events });
      const stats = computeTournamentStats([match]);
      expect(stats["bayindir"].goalsConceded).toBe(2);
    });

    it("falls back to full score for starter GK when no events present", () => {
      const gk = makePlayer({ unitedPlayerId: "bayindir", name: "Altay Bayindir", position: "GK", minutesPlayed: 90 });
      const match = makeMatch({ score: { home: 0, away: 3 }, homeLineup: [gk], events: [] });
      const stats = computeTournamentStats([match]);
      expect(stats["bayindir"].goalsConceded).toBe(3);
    });

    it("does NOT charge sub GK when no events present (can't know when goals were scored)", () => {
      const gk = makePlayer({
        unitedPlayerId: "bayindir",
        name: "Altay Bayindir",
        position: "GK",
        starter: false,
        subOnMinute: 46,
        minutesPlayed: 44,
      });
      const match = makeMatch({ score: { home: 0, away: 2 }, homeLineup: [gk], events: [] });
      const stats = computeTournamentStats([match]);
      expect(stats["bayindir"].goalsConceded).toBe(0);
    });

    it("only charges sub GK for goals scored after they came on (event-based)", () => {
      const gk = makePlayer({
        unitedPlayerId: "bayindir",
        name: "Altay Bayindir",
        position: "GK",
        starter: false,
        subOnMinute: 46,
        minutesPlayed: 44,
      });
      const events: MatchEvent[] = [
        { id: "g1", minute: 20, type: "goal", team: "away", player: { name: "Scorer" } }, // before sub
        { id: "g2", minute: 60, type: "goal", team: "away", player: { name: "Scorer" } }, // after sub
      ];
      const match = makeMatch({ score: { home: 0, away: 2 }, homeLineup: [gk], events });
      const stats = computeTournamentStats([match]);
      expect(stats["bayindir"].goalsConceded).toBe(1);
    });
  });
});
