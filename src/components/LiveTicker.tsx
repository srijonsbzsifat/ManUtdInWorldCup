"use client";
import useSWR, { useSWRConfig } from "swr";
import { MatchCard } from "./MatchCard";
import { LoadingSpinner } from "./LoadingSpinner";
import type { Match } from "@/types";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Polls /api/live every 30s.  When there is at least one match being played
 * the section becomes a live ticker; otherwise it shows the next 5 fixtures.
 * Cross-invalidates the upcoming fixtures endpoint so a match that just went
 * live is immediately removed from the "Upcoming fixtures" section.
 */
export function LiveTicker() {
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR<{ live: Match[]; count: number }>(
    "/api/live",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      onSuccess: (liveData) => {
        // When live data refreshes, also revalidate upcoming fixtures
        // so matches that recently went live vanish from the upcoming list.
        mutate("/api/matches?status=upcoming&limit=6");
        // If a live match has just finished (e.g. ticker went from live→empty),
        // revalidate the finished matches list and player stats.
        if (!liveData?.live?.length) {
          mutate("/api/matches?status=finished");
          mutate("/api/stats");
        }
      },
    }
  );

  const live = data?.live ?? [];
  const hasLiveMatches = live.length > 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold">
            {hasLiveMatches ? "Live now" : "Live now"}
          </h2>
          {hasLiveMatches && <span className="live-dot" />}
        </div>
        {hasLiveMatches ? (
          <a href="/live" className="text-xs text-white/50 hover:text-white">
            See all →
          </a>
        ) : (
          <a href="/matches?tab=upcoming" className="text-xs text-white/50 hover:text-white">
            Check upcoming matches →
          </a>
        )}
      </div>

      {isLoading && (
        <LoadingSpinner text={hasLiveMatches ? "Checking for live action..." : "Checking for live action..."} />
      )}

      {error && (
        <div className="glass p-4 text-sm text-red-300">
          Failed to load live data. Retrying automatically...
        </div>
      )}

      {!isLoading && !hasLiveMatches && (
        <p className="text-sm text-white/50">
          No Manchester United players are currently on the pitch at the
          World Cup or in international friendlies.
        </p>
      )}

      {hasLiveMatches && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          {live.slice(0, 6).map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}