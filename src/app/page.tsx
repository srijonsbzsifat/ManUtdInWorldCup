"use client";
import { LiveTicker } from "@/components/LiveTicker";
import { StatsLeaderboard } from "@/components/StatsLeaderboard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { UNITED_PLAYERS } from "@/lib/players";
import { MatchCard } from "@/components/MatchCard";
import useSWR from "swr";
import type { Match } from "@/types";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-10 animate-fade-in">
      <Hero />

      <LiveTicker />

      <Section title="Red Devils on duty" subtitle="Tap a card for full stats, lineups and goals.">
        <StatsLeaderboard players={UNITED_PLAYERS} />
      </Section>

      <UpcomingMatches />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-united-red/15 via-united-dark to-united-dark p-6 sm:p-10">
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-united-red/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-united-gold/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative max-w-3xl">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-united-red/20 border border-united-red/30 text-xs text-united-gold font-semibold mb-4">
          <span className="live-dot" />
          2026 FIFA World Cup
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3">
          Follow every Red Devil
          <br />
          on the world stage.
        </h1>
        <p className="text-white/70 text-sm sm:text-base max-w-xl mb-6">
          Live scores, FotMob-style ratings, goals, assists, clean sheets and
          minutes played for every Manchester United player representing their
          nation at the 2026 World Cup and in international friendlies.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/players"
            className="px-4 py-2 rounded-lg bg-united-red text-white text-sm font-semibold hover:bg-united-darkred transition-colors"
          >
            Browse players
          </Link>
          <Link
            href="/matches"
            className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            All matches
          </Link>
        </div>
      </div>
    </section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function UpcomingMatches() {
  const { data, isLoading } = useSWR<{ matches: Match[] }>("/api/matches?status=upcoming", {
    refreshInterval: 60_000,
  });
  const matches = (data?.matches ?? []).slice(0, 6);
  return (
    <Section title="Upcoming fixtures" subtitle="Next six games involving our nations.">
      {isLoading ? (
        <LoadingSpinner text="Loading upcoming fixtures..." />
      ) : matches.length === 0 ? (
        <p className="text-sm text-white/50">No upcoming fixtures in the next 30 days.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </Section>
  );
}
