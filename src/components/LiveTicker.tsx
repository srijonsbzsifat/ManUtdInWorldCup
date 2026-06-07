"use client";
import useSWR from "swr";
import { MatchCard } from "./MatchCard";
import { LoadingSpinner } from "./LoadingSpinner";
import type { Match } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Polls /api/live every 30s.  When there is at least one match being played
 * the section becomes a live ticker; otherwise it shows the next 5 fixtures.
 */
export function LiveTicker() {
  const { data, error, isLoading } = useSWR<{ live: Match[]; count: number }>(
    "/api/live",
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  const live = data?.live ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold">
            {live.length > 0 ? "Live now" : "Next fixtures"}
          </h2>
          {live.length > 0 && <span className="live-dot" />}
        </div>
        <a href="/live" className="text-xs text-white/50 hover:text-white">
          See all →
        </a>
      </div>

      {isLoading && (
        <LoadingSpinner text="Checking for live action..." />
      )}

      {error && (
        <div className="glass p-4 text-sm text-red-300">
          Failed to load live data. Retrying automatically...
        </div>
      )}

      {!isLoading && live.length === 0 && (
        <p className="text-sm text-white/50">
          No Manchester United players are currently on the pitch at the
          World Cup or in international friendlies. Check upcoming matches →
        </p>
      )}

      {live.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          {live.slice(0, 6).map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
