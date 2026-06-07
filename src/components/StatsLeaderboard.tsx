"use client";
import useSWR from "swr";
import { PlayerCard } from "./PlayerCard";
import { LoadingSpinner } from "./LoadingSpinner";
import type { UnitedPlayer, PlayerTournamentStats } from "@/types";

interface StatsResponse {
  stats: Record<string, PlayerTournamentStats>;
  topScorers: PlayerTournamentStats[];
  topRated: PlayerTournamentStats[];
  matchesAnalysed: number;
  totalFixtures: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function StatsLeaderboard({
  players,
}: {
  players: UnitedPlayer[];
}) {
  const { data, isLoading, error } = useSWR<StatsResponse>("/api/stats", fetcher, {
    refreshInterval: 60_000,
  });

  if (isLoading) {
    return <LoadingSpinner text="Loading stats..." />;
  }

  if (error) {
    return (
      <div className="glass p-4 text-sm text-red-300">
        Failed to load stats. The ESPN feed may be temporarily unavailable.
      </div>
    );
  }

  const stats = data?.stats ?? {};
  const ordered = players
    .map((p) => ({ player: p, stats: stats[p.id] }))
    .filter((row) => row.stats)
    .sort((a, b) => (b.stats.matches ?? 0) - (a.stats.matches ?? 0));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map(({ player, stats }, i) => (
        <PlayerCard
          key={player.id}
          player={player}
          stats={stats}
          rank={stats.matches > 0 ? i + 1 : undefined}
        />
      ))}
    </div>
  );
}
