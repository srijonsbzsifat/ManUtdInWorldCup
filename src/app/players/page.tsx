"use client";
import { useState, useMemo } from "react";
import { UNITED_PLAYERS, NATIONAL_TEAMS } from "@/lib/players";
import { PlayerCard } from "@/components/PlayerCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import useSWR from "swr";
import type { PlayerTournamentStats } from "@/types";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const POSITIONS = ["All", "GK", "DF", "MF", "FW"] as const;

export default function PlayersPage() {
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("All");
  const [nation, setNation] = useState<string>("All");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR<{ stats: Record<string, PlayerTournamentStats> }>(
    "/api/stats",
    fetcher,
    { refreshInterval: 60_000 }
  );

  const filtered = useMemo(() => {
    return UNITED_PLAYERS.filter((p) => {
      if (pos !== "All") {
        const isPos =
          pos === "DF" ? ["CB", "LB", "RB", "DF"].includes(p.position) :
          pos === "MF" ? ["DM", "CM", "AM", "MF"].includes(p.position) :
          pos === "FW" ? ["ST", "CF", "LW", "RW", "FW"].includes(p.position) :
          p.position === pos;
        if (!isPos) return false;
      }
      if (nation !== "All" && p.nation.id !== nation) return false;
      if (query && !`${p.name} ${p.shortName}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [pos, nation, query]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold">Players</h1>
        <p className="text-sm text-white/50 mt-1">
          {UNITED_PLAYERS.length} Manchester United players tracked across{" "}
          {NATIONAL_TEAMS.length} national teams.
        </p>
      </header>

      <div className="glass p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="stat-label block mb-1">Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Bruno, Casemiro, Martinez..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-united-red"
          />
        </div>
        <div>
          <label className="stat-label block mb-1">Position</label>
          <div className="flex gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pos === p
                    ? "bg-united-red text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="stat-label block mb-1">Nation</label>
          <Select
            value={nation}
            onChange={setNation}
            options={NATIONAL_TEAMS.map((n) => ({ value: n.id, label: n.name }))}
            allLabel="All nations"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner text="Loading player stats..." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              stats={
                data?.stats?.[p.id] ?? {
                  playerId: p.id,
                  matches: 0, starts: 0, subs: 0, minutesPlayed: 0,
                  goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0,
                  redCards: 0, averageRating: null, ownGoals: 0,
                  bestRating: null, worstRating: null, motmCount: 0,
                  goalsPerMatch: 0, minutesPerGoal: null,
                  goalsConceded: 0, saves: 0,
                }
              }
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-white/50 col-span-full">No players match those filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
