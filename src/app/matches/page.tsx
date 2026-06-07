"use client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { MatchCard } from "@/components/MatchCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Select } from "@/components/Select";
import type { Match } from "@/types";
import { NATIONAL_TEAMS } from "@/lib/players";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = "all" | "live" | "upcoming" | "finished";

export default function MatchesPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [nation, setNation] = useState<string>("All");

  const { data, isLoading } = useSWR<{ matches: Match[]; count: number }>(
    tab === "all"
      ? "/api/matches"
      : `/api/matches?status=${tab}`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const matches = useMemo(() => {
    let m = data?.matches ?? [];
    if (nation !== "All") {
      const code = nation.toUpperCase();
      m = m.filter((x) => x.home.code === code || x.away.code === code);
    }
    return m;
  }, [data, nation]);

  const groups = useMemo(() => groupByDate(matches), [matches]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Matches</h1>
          <p className="text-sm text-white/50 mt-1">
            World Cup games and international friendlies featuring Manchester
            United players.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {(["all", "live", "upcoming", "finished"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors",
                  tab === t
                    ? "bg-united-red text-white"
                    : "text-white/60 hover:text-white"
                )}
              >
                {t === "live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />}
                {t}
              </button>
            ))}
          </div>
          <Select
            value={nation}
            onChange={setNation}
            options={NATIONAL_TEAMS.map((n) => ({ value: n.id, label: n.name }))}
            allLabel="All nations"
          />
        </div>
      </header>

      {isLoading && (
        <LoadingSpinner text="Loading matches..." />
      )}

      {!isLoading && matches.length === 0 && (
        <p className="text-sm text-white/50">No matches match those filters.</p>
      )}

      {Array.from(groups.entries()).map(([date, list]) => (
        <div key={date}>
          <h2 className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">
            {date}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDate(matches: Match[]) {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const d = new Date(m.kickoff);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (isSameDay(d, today)) label = "Today";
    else if (isSameDay(d, tomorrow)) label = "Tomorrow";
    else if (isSameDay(d, yesterday)) label = "Yesterday";
    else
      label = new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(m);
  }
  return groups;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
