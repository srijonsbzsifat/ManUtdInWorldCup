"use client";
import useSWR from "swr";
import Link from "next/link";
import type { Match, LineupPlayer, MatchEvent } from "@/types";
import { StatusPill } from "@/components/StatusPill";
import { RatingBadge } from "@/components/RatingBadge";
import { NationFlag } from "@/components/NationFlag";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn, formatDate, formatTimeLocal, ratingColor, ratingLabel } from "@/lib/utils";
import { findUnitedPlayersInLineup } from "@/lib/aggregator";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MatchPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, error, isLoading } = useSWR<{ match: Match }>(
    `/api/matches/${id}`,
    fetcher,
    { refreshInterval: 20_000 }
  );

  if (isLoading) {
    return <LoadingSpinner text="Loading match details..." />;
  }

  if (error || !data?.match) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-base font-semibold mb-1">Match not found</p>
        <p className="text-sm text-white/50 mb-4">
          The match could not be loaded, or it is outside the 30-day window.
        </p>
        <Link href="/matches" className="text-united-red hover:underline text-sm">
          ← Back to matches
        </Link>
      </div>
    );
  }

  const match = data.match;
  const isFinished = match.status === "FINISHED";

  return (
    <div className="space-y-6 animate-fade-in">
      <Link href="/matches" className="text-xs text-white/50 hover:text-white">
        ← All matches
      </Link>

      <MatchHeader match={match} />

      {match.lineups ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <LineupPanel side="home" match={match} />
          <LineupPanel side="away" match={match} />
        </div>
      ) : (
        <div className="glass p-6 text-center text-sm text-white/50">
          Lineups are not yet available. They will appear here as soon as the
          teams are announced.
        </div>
      )}

      {match.events.length > 0 && <EventsTimeline match={match} />}

      {match.events.length === 0 && match.status === "SCHEDULED" && (
        <div className="glass p-6 text-center text-sm text-white/50">
          Match kicks off at {formatTimeLocal(match.kickoff)} (local time) on{" "}
          {formatDate(match.kickoff)}.
        </div>
      )}

      {isFinished && !match.lineups && (
        <div className="glass p-6 text-center text-sm text-white/50">
          This match has finished. Detailed player statistics are not available
          from the public data feed for this fixture.
        </div>
      )}
    </div>
  );
}

function MatchHeader({ match }: { match: Match }) {
  return (
    <header className="glass p-6 sm:p-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] uppercase tracking-wider text-white/50">
          {match.competition.name}
          {match.venue && <> · {match.venue}{match.city ? `, ${match.city}` : ""}</>}
        </div>
        <StatusPill status={match.status} minute={match.minute} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8 py-4">
        <TeamDisplay team={match.home} align="right" />
        <div className="text-center">
          {match.status === "SCHEDULED" || match.status === "TIMED" ? (
            <div>
              <div className="text-2xl sm:text-4xl font-extrabold tabular-nums">
                {formatTimeLocal(match.kickoff)}
              </div>
              <div className="text-[10px] text-white/50 mt-1">Kick-off (local time)</div>
            </div>
          ) : (
            <div>
              <div className="text-4xl sm:text-6xl font-extrabold tabular-nums tracking-tight">
                {match.score.home ?? 0}
                <span className="mx-2 text-white/30">-</span>
                {match.score.away ?? 0}
              </div>
              <div className="text-[10px] text-white/50 mt-1 uppercase">
                {match.status === "FINISHED"
                  ? "Full time"
                  : match.minute != null && match.minute !== "HT"
                    ? `${match.minute}'`
                    : match.minute === "HT"
                      ? "HT"
                      : "LIVE"}
              </div>
            </div>
          )}
        </div>
        <TeamDisplay team={match.away} align="left" />
      </div>

      {match.motm && (
        <div className="mt-4 text-center text-sm text-united-gold">
          ⭐ Man of the match: <span className="font-semibold">{match.motm.name}</span>
        </div>
      )}
    </header>
  );
}

function TeamDisplay({ team, align }: { team: Match["home"]; align: "left" | "right" }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", align === "right" ? "sm:items-end" : "sm:items-start")}>
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg bg-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${team.color}33 0%, ${team.color}99 100%)` }}
      >
        <NationFlag
          code={team.code}
          shortName={team.shortName ?? team.name}
          emoji={team.flag}
          size={56}
          rounded
          title={`${team.name} flag`}
        />
      </div>
      <div className={cn("text-center sm:text-left", align === "right" && "sm:text-right")}>
        <div className="text-base sm:text-xl font-bold">{team.name}</div>
        <div className="text-[11px] text-white/40 uppercase tracking-wider">{team.code}</div>
      </div>
    </div>
  );
}

function LineupPanel({ side, match }: { side: "home" | "away"; match: Match }) {
  if (!match.lineups) return null;
  const lineup = side === "home" ? match.lineups.home : match.lineups.away;
  const team = side === "home" ? match.home : match.away;
  const starters = lineup.filter((p) => p.starter);
  const subs = lineup
    .filter((p) => !p.starter)
    .sort((a, b) => (a.subOnMinute ?? 999) - (b.subOnMinute ?? 999));
  const united = findUnitedPlayersInLineup(lineup);

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full overflow-hidden bg-white flex items-center justify-center"
            style={{ background: team.color }}
          >
            <NationFlag
              code={team.code}
              shortName={team.shortName ?? team.name}
              emoji={team.flag}
              size={26}
              rounded
              title={`${team.name} flag`}
            />
          </div>
          <h3 className="text-sm font-semibold">{team.name}</h3>
          {united.length > 0 && (
            <span className="pill bg-united-red/20 text-united-red text-[10px] font-semibold">
              {united.length} Red Devil{united.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/40">
          {starters.length} start · {subs.length} sub
        </span>
      </div>

      <div className="space-y-1.5">
        {starters.map((p) => (
          <LineupRow key={p.id} player={p} side={side} />
        ))}
        {subs.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-white/40 mt-3 mb-1 font-semibold">
              Substitutes
            </div>
            {subs.map((p) => (
              <LineupRow key={p.id} player={p} side={side} isSub />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LineupRow({
  player,
  side,
  isSub,
}: {
  player: LineupPlayer;
  side: "home" | "away";
  isSub?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
        player.isUnitedPlayer
          ? "bg-united-red/10 border border-united-red/20"
          : "hover:bg-white/5"
      )}
    >
      <div className="w-7 h-7 rounded-full bg-white/10 text-white/60 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {player.shirtNumber || "•"}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("truncate text-sm", player.isUnitedPlayer && "font-semibold text-united-gold")}>
          {player.name}
          {player.captain && <span className="ml-1 text-[10px] text-white/40">(C)</span>}
          {player.motm && <span className="ml-1 text-united-gold" title="Man of the match">⭐</span>}
        </div>
        <div className="text-[10px] text-white/40 flex items-center gap-1.5">
          {player.position}
          {isSub && player.subOnMinute && (
            <span className="text-emerald-400">↑ {player.subOnMinute}&apos;</span>
          )}
          {!isSub && player.subOffMinute && (
            <span className="text-amber-400">↓ {player.subOffMinute}&apos;</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {(player.goals ?? 0) > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
            ⚽ {player.goals}
          </span>
        )}
        {(player.assists ?? 0) > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
            🎯 {player.assists}
          </span>
        )}
        {player.cleanSheet && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title="Clean sheet">
            🛡
          </span>
        )}
        {(player.yellowCards ?? 0) > 0 && <span className="text-[10px]">🟨</span>}
        {(player.redCards ?? 0) > 0 && <span className="text-[10px]">🟥</span>}
        <RatingBadge rating={player.rating} size="sm" />
      </div>
    </div>
  );
}

function EventsTimeline({ match }: { match: Match }) {
  const events = [...match.events].sort((a, b) => {
    const aT = a.minute + (a.stoppage ?? 0) / 100;
    const bT = b.minute + (b.stoppage ?? 0) / 100;
    return aT - bT;
  });
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Match events</h2>
      <div className="glass p-4 space-y-2">
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: MatchEvent }) {
  const icon = (() => {
    switch (event.type) {
      case "goal": return "⚽";
      case "penalty_scored": return "⚽";
      case "penalty_missed": return "❌";
      case "yellow_card": return "🟨";
      case "red_card": return "🟥";
      case "substitution": return "🔁";
      case "kickoff": return "▶";
      case "half_time": return "⏸";
      case "full_time": return "⏹";
      default: return "•";
    }
  })();
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-10 text-center text-xs text-white/40 tabular-nums font-mono flex-shrink-0">
        {event.minute}{event.stoppage ? `+${event.stoppage}` : ""}&apos;
      </div>
      <div className="text-lg w-6 text-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        {event.type === "goal" || event.type === "penalty_scored" ? (
          <>
            <div className="font-semibold">
              {event.player?.name}
              {event.assistPlayer && (
                <span className="text-white/40 text-xs ml-1.5">
                  (assist: {event.assistPlayer.name})
                </span>
              )}
            </div>
            {event.scoreAfter && (
              <div className="text-[10px] text-white/50 mt-0.5">
                Score: {event.scoreAfter.home} - {event.scoreAfter.away}
              </div>
            )}
          </>
        ) : event.type === "substitution" ? (
          <>
            <div className="font-semibold">
              {event.player?.name}
            </div>
            {event.detail && (
              <div className="text-[10px] text-white/50 mt-0.5">{event.detail}</div>
            )}
          </>
        ) : (
          <div className="font-semibold">
            {event.player?.name ?? event.detail ?? event.type.replace(/_/g, " ")}
          </div>
        )}
      </div>
    </div>
  );
}
