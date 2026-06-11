"use client";
import useSWR from "swr";
import MatchCard from "@/components/MatchCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { Match } from "@/types";

export default function LivePage() {
  const { data, error, isLoading } = useSWR<{ live: Match[]; count: number; lastUpdated: string }>(
    "/api/live",
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  const live = data?.live ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          Live now
          <span className="live-dot" />
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Auto-refreshes every 15 seconds.
          {data?.lastUpdated && (
            <>
              {" "}Last updated:{" "}
              {new Date(data.lastUpdated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </>
          )}
        </p>
      </header>

      {isLoading && (
        <LoadingSpinner text="Checking for live matches..." />
      )}

      {error && (
        <div className="glass p-4 text-sm text-red-300">
          Failed to load live data. Retrying automatically...
        </div>
      )}

      {!isLoading && live.length === 0 && (
        <div className="glass p-8 text-center">
          <div className="text-5xl mb-3">⚽</div>
          <p className="text-base font-semibold mb-1">No live matches</p>
          <p className="text-sm text-white/50">
            No Manchester United players are currently on the pitch in the
            World Cup or international friendlies.
          </p>
          <a
            href="/matches?tab=upcoming"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-united-red text-white text-sm font-semibold"
          >
            View upcoming matches
          </a>
        </div>
      )}

      {live.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
