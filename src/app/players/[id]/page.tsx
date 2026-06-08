"use client";
import useSWR from "swr";
import { RatingBadge } from "@/components/RatingBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { NationFlag } from "@/components/NationFlag";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type {
  UnitedPlayer,
  PlayerMatchPerformance,
  PlayerTournamentStats,
} from "@/types";
import { useMemo } from "react";
import { formatDate, formatTime, relativeTime, cn, ratingColor, ratingLabel } from "@/lib/utils";
import Link from "next/link";

interface PlayerResponse {
  player: UnitedPlayer;
  performances: PlayerMatchPerformance[];
  stats: PlayerTournamentStats;
  matchesInWindow: number;
}

export default function PlayerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, error, isLoading } = useSWR<PlayerResponse>(
    `/api/players/${id}`,
    { refreshInterval: 60_000 }
  );

  if (isLoading) {
    return <LoadingSpinner text="Loading player data..." />;
  }

  if (error || !data) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-base font-semibold mb-1">Player not found</p>
        <p className="text-sm text-white/50 mb-4">
          The player &quot;{id}&quot; is not in the Manchester United squad
          tracker, or the data feed is temporarily unavailable.
        </p>
        <Link href="/players" className="text-united-red hover:underline text-sm">
          ← Back to all players
        </Link>
      </div>
    );
  }

  const { player, stats, performances } = data;

  return (
    <div className="space-y-8 animate-fade-in">
      <PlayerHeader player={player} stats={stats} />
      <StatsGrid stats={stats} player={player} />
      <PerformanceLog performances={performances} />
      <RecentStats performances={performances} />
    </div>
  );
}

function PlayerHeader({
  player,
  stats,
}: {
  player: UnitedPlayer;
  stats: PlayerTournamentStats;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-united-red/15 via-united-dark to-united-dark p-6 sm:p-8">
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl pointer-events-none" style={{ background: `${player.nation.color}30` }} />
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <PlayerAvatar player={player} size={96} />
        <div className="flex-1">
          <Link href="/players" className="text-xs text-white/40 hover:text-white/70">
            ← All players
          </Link>
          <h1 className="text-2xl sm:text-4xl font-extrabold mt-1">
            {player.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-white/70">
            <span className="px-2 py-0.5 rounded bg-white/10 font-medium">{player.position}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <NationFlag
                code={player.nation.code}
                shortName={player.nation.name}
                emoji={player.nation.flag}
                size={18}
                title={player.nation.name}
              />
              {player.nation.name}
            </span>
            <span>·</span>
            <span>#{player.shirtNumber} at United</span>
            {player.loaned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-semibold uppercase tracking-wide">
                <span aria-hidden>↪</span>
                <span>On loan at {player.loaned}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center sm:items-end">
          <RatingBadge rating={stats.averageRating} size="lg" showLabel />
          <p className="text-xs text-white/50 mt-2">
            {stats.matches} appearance{stats.matches === 1 ? "" : "s"} ·{" "}
            {stats.starts} start{stats.starts === 1 ? "" : "s"} ·{" "}
            {stats.subs} sub appearance{stats.subs === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </header>
  );
}

function StatsGrid({
  stats,
  player,
}: {
  stats: PlayerTournamentStats;
  player: UnitedPlayer;
}) {
  const isGoalkeeper = player.position === "GK";
  if (isGoalkeeper) {
    return (
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Clean Sheets" value={stats.cleanSheets} highlight={stats.cleanSheets > 0} />
        <StatTile label="Saves" value={stats.saves} highlight={stats.saves > 0} />
        <StatTile label="Goals Conceded" value={stats.goalsConceded} warn={stats.goalsConceded > 0} />
        <StatTile label="Avg Rating" value={stats.averageRating !== null ? stats.averageRating.toFixed(2) : "—"} />
        <StatTile label="Apps" value={stats.matches} />
        <StatTile label="Starts" value={stats.starts} />
        <StatTile label="Subs" value={stats.subs} />
        <StatTile label="Minutes" value={stats.minutesPlayed} />
        <StatTile label="Yellows" value={stats.yellowCards} />
        <StatTile label="Reds" value={stats.redCards} />
        <StatTile label="MOTM" value={stats.motmCount} />
        <StatTile label="Best Rating" value={stats.bestRating !== null ? stats.bestRating.toFixed(1) : "—"} />
      </section>
    );
  }
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile label="Goals" value={stats.goals} highlight={stats.goals > 0} />
      <StatTile label="Assists" value={stats.assists} highlight={stats.assists > 0} />
      <StatTile label="Minutes" value={stats.minutesPlayed} />
      <StatTile label="Avg Rating" value={stats.averageRating !== null ? stats.averageRating.toFixed(2) : "—"} />
      <StatTile label="Apps" value={stats.matches} />
      <StatTile label="Starts" value={stats.starts} />
      <StatTile label="Subs" value={stats.subs} />
      <StatTile label="Best Rating" value={stats.bestRating !== null ? stats.bestRating.toFixed(1) : "—"} />
      <StatTile label="Yellows" value={stats.yellowCards} />
      <StatTile label="Reds" value={stats.redCards} />
      <StatTile label="MOTM" value={stats.motmCount} />
      <StatTile label="Mins / Goal" value={stats.minutesPerGoal !== null ? `${stats.minutesPerGoal}'` : "—"} />
    </section>
  );
}

function StatTile({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={cn(
        "stat-value",
        highlight && "text-emerald-400",
        warn && "text-red-400"
      )}>{value}</div>
    </div>
  );
}

function PerformanceLog({ performances }: { performances: PlayerMatchPerformance[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Match-by-match</h2>
      {performances.length === 0 ? (
        <div className="glass p-6 text-center text-sm text-white/50">
          No appearances yet in the current window. Check back after the next
          international break.
        </div>
      ) : (
        <div className="space-y-2">
          {performances.map((p, idx) => (
            <PerformanceRow key={`${p.match.id}-${idx}`} perf={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PerformanceRow({ perf }: { perf: PlayerMatchPerformance }) {
  const { match, player, opponent, result, score, competition } = perf;
  const resultColor =
    result === "W" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
    result === "L" ? "bg-red-500/15 text-red-300 border-red-500/30" :
    result === "D" ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" :
    "bg-white/5 text-white/60 border-white/10";

  return (
    <Link
      href={`/matches/${match.id}`}
      className="glass glass-hover p-3 sm:p-4 block"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-center w-14">
          <div className="text-[10px] uppercase text-white/40">
            {new Date(match.kickoff).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </div>
          <div className={cn("mt-1 text-xs font-bold px-1.5 py-0.5 rounded border", resultColor)}>
            {result}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <NationFlag
              code={opponent.code}
              shortName={opponent.shortName ?? opponent.name}
              emoji={opponent.flag}
              size={24}
              rounded
              title={`${opponent.name} flag`}
            />
            <div className="text-sm font-semibold truncate">
              vs {opponent.name}
            </div>
            <div className="text-xs text-white/40">· {competition}</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/50 flex-wrap">
            <Tag icon="⏱" label={`${player.minutesPlayed}'`} />
            {player.starter ? <Tag icon="▶" label="Started" /> : <Tag icon="↻" label={`Sub · on ${player.subOnMinute ?? "?"}'`} />}
            {player.subOffMinute && <Tag icon="↺" label={`Off ${player.subOffMinute}'`} />}
            {player.captain && <Tag icon="©" label="Captain" />}
            {(player.goals ?? 0) > 0 && <Tag icon="⚽" label={`${player.goals ?? 0} goal${(player.goals ?? 0) > 1 ? "s" : ""}`} highlight />}
            {(player.assists ?? 0) > 0 && <Tag icon="🎯" label={`${player.assists ?? 0} assist${(player.assists ?? 0) > 1 ? "s" : ""}`} highlight />}
            {player.cleanSheet && <Tag icon="🛡" label="Clean sheet" highlight />}
            {(player.saves ?? 0) > 0 && <Tag icon="🧤" label={`${player.saves} save${(player.saves ?? 0) > 1 ? "s" : ""}`} highlight />}
            {(player.goalsConceded ?? 0) > 0 && <Tag icon="⛔" label={`${player.goalsConceded} conceded`} />}
            {(player.yellowCards ?? 0) > 0 && <Tag icon="🟨" label={`${player.yellowCards} yellow`} />}
            {(player.redCards ?? 0) > 0 && <Tag icon="🟥" label={`${player.redCards} red`} />}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-base font-bold tabular-nums mb-1">{score}</div>
          <RatingBadge rating={player.rating} size="sm" />
        </div>
      </div>
    </Link>
  );
}

function Tag({ icon, label, highlight }: { icon: string; label: string; highlight?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]",
        highlight ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/60"
      )}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function RecentStats({ performances }: { performances: PlayerMatchPerformance[] }) {
  if (performances.length === 0) return null;
  const { last5, avg, goals, assists } = useMemo(() => {
    const l5 = performances.slice(0, 5).reverse();
    const ratings = l5.map((p) => p.player.rating).filter((r): r is number => r !== null && r !== undefined);
    return {
      last5: l5,
      avg: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : "—",
      goals: l5.reduce((s, p) => s + (p.player.goals ?? 0), 0),
      assists: l5.reduce((s, p) => s + (p.player.assists ?? 0), 0),
    };
  }, [performances]);
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Form (last 5)</h2>
      <div className="glass p-4 flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
        {last5.map((p, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[56px]">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                ratingColor(p.player.rating ?? null)
              )}
            >
              {p.player.rating !== null && p.player.rating !== undefined
                ? p.player.rating.toFixed(1)
                : "—"}
            </div>
            <div className="text-[10px] text-white/50">
              {new Date(p.match.kickoff).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </div>
            <div className="text-[9px] text-white/40">
              {p.result}
            </div>
          </div>
        ))}
        <div className="ml-auto pl-4 border-l border-white/5 flex gap-4 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">{avg}</div>
            <div className="text-[10px] text-white/40 uppercase">Avg</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">{goals}</div>
            <div className="text-[10px] text-white/40 uppercase">G</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">{assists}</div>
            <div className="text-[10px] text-white/40 uppercase">A</div>
          </div>
        </div>
      </div>
    </section>
  );
}
