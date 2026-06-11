"use client";
import useSWR from "swr";
import Link from "next/link";
import type { Match, MatchEvent } from "@/types";
import { StatusPill } from "@/components/StatusPill";
import { MatchLineup } from "@/components/MatchLineup";
import { NationFlag } from "@/components/NationFlag";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn, formatDate, formatTimeLocal } from "@/lib/utils";

export default function MatchPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, error, isLoading } = useSWR<{ match: Match }>(
    `/api/matches/${id}`,
    { refreshInterval: (d) => d?.match?.status === "FINISHED" ? 0 : 20_000 }
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

      {match.events.length > 0 && <GoalScorersSummary match={match} />}

      {match.lineups && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Lineup & Formation</h2>
          <MatchLineup match={match} />
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

function GoalScorersSummary({ match }: { match: Match }) {
  const scoringEvents = match.events.filter(
    e => e.type === "goal" || e.type === "penalty_scored" || e.type === "own_goal"
  );

  if (scoringEvents.length === 0) return null;

  const homeScoring = scoringEvents.filter(e => e.team === "home");
  const awayScoring = scoringEvents.filter(e => e.team === "away");

  return (
    <div className="glass p-4 space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
        <div className={cn("space-y-1", homeScoring.length === 0 && "opacity-50")}>
          {homeScoring.map((event, i) => {
            const isOwnGoal = event.type === "own_goal";
            return (
              <div key={i} className="flex items-center justify-end gap-2 text-sm">
                <span className="text-white/90">{event.player?.name}</span>
                {event.assistPlayer && (
                  <span className="text-[10px] text-white/40">
                    (assist: {event.assistPlayer.name})
                  </span>
                )}
                <span className="text-xs text-white/50 font-mono">
                  {event.minute}{event.stoppage ? `+${event.stoppage}` : ""}&apos;
                </span>
                <span>{isOwnGoal ? "🔴 (OG)" : "⚽"}</span>
              </div>
            );
          })}
          {homeScoring.length === 0 && (
            <div className="text-sm text-white/40 text-right">No goals</div>
          )}
        </div>

        <div className="w-px bg-white/10" />

        <div className={cn("space-y-1", awayScoring.length === 0 && "opacity-50")}>
          {awayScoring.map((event, i) => {
            const isOwnGoal = event.type === "own_goal";
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span>{(isOwnGoal ? "🔴 (OG)" : "⚽")}</span>
                <span className="text-xs text-white/50 font-mono">
                  {event.minute}{event.stoppage ? `+${event.stoppage}` : ""}&apos;
                </span>
                <span className="text-white/90">{event.player?.name}</span>
                {event.assistPlayer && (
                  <span className="text-[10px] text-white/40">
                    (assist: {event.assistPlayer.name})
                  </span>
                )}
              </div>
            );
          })}
          {awayScoring.length === 0 && (
            <div className="text-sm text-white/40">No goals</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventsTimeline({ match }: { match: Match }) {
  const events = [...match.events].sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    return (a.stoppage ?? 0) - (b.stoppage ?? 0);
  });

  const homeEvents = events.filter(e => e.team === "home");
  const awayEvents = events.filter(e => e.team === "away");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Match events</h2>
      <div className="grid grid-cols-2 gap-4">
        <EventColumn teamName={match.home.shortName} teamColor={match.home.color} events={homeEvents} align="right" />
        <EventColumn teamName={match.away.shortName} teamColor={match.away.color} events={awayEvents} align="left" />
      </div>
    </section>
  );
}

function EventColumn({ teamName, teamColor, events, align }: { teamName: string; teamColor: string; events: MatchEvent[]; align: "left" | "right" }) {
  return (
    <div className="glass p-4 space-y-2">
      <div className={`text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2 ${align === "right" ? "text-right" : ""}`}>
        {teamName}
      </div>
      <div className="w-full h-px bg-white/10 mb-2" />
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} align={align} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/40 text-center py-4">No events</div>
      )}
    </div>
  );
}

function EventRow({ event, align }: { event: MatchEvent; align: "left" | "right" }) {
  const icon = (() => {
    switch (event.type) {
      case "goal": return "⚽";
      case "own_goal": return "🔴";
      case "penalty_scored": return "⚽";
      case "penalty_missed": return "❌";
      case "penalty_saved": return "🧤";
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
      <div className="text-lg w-6 text-center flex-shrink-0" aria-hidden="true">{icon}</div>
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
        ) : event.type === "own_goal" ? (
          <>
            <div className="font-semibold text-red-500">
              {event.player?.name} (OG)
            </div>
            {event.scoreAfter && (
              <div className="text-[10px] text-white/50 mt-0.5">
                Score: {event.scoreAfter.home} - {event.scoreAfter.away}
              </div>
            )}
          </>
        ) : event.type === "penalty_missed" ? (
          <>
            <div className="font-semibold">
              {event.player?.name} (Penalty missed)
            </div>
            {event.detail && (
              <div className="text-[10px] text-white/50 mt-0.5">{event.detail}</div>
            )}
          </>
        ) : event.type === "penalty_saved" ? (
          <>
            <div className="font-semibold">
              {event.player?.name} (Penalty saved)
            </div>
            {event.detail && (
              <div className="text-[10px] text-white/50 mt-0.5">{event.detail}</div>
            )}
          </>
        ) : event.type === "yellow_card" ? (
          <div>
            <div className="font-semibold">{event.player?.name}</div>
            <div className="text-[10px] text-yellow-400/80 mt-0.5">Yellow card</div>
          </div>
        ) : event.type === "red_card" ? (
          <div>
            <div className="font-semibold text-red-400">{event.player?.name}</div>
            <div className="text-[10px] text-red-400/70 mt-0.5">Red card · Dismissed</div>
          </div>
        ) : event.type === "substitution" ? (
          <div>
            <div className="font-semibold flex items-center gap-1">
              <span className="text-emerald-400 text-xs">↑</span>
              <span>{event.player?.name}</span>
            </div>
            {event.detail && (
              <div className="text-[10px] text-red-400/80 mt-0.5 flex items-center gap-1">
                <span>↓</span>
                <span>{event.detail.startsWith("On for ") ? event.detail.slice(7) : event.detail}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="font-semibold">
            {event.player?.name ?? event.detail ?? event.type.replace(/_/g, " ")}
          </div>
        )}
      </div>
    </div>
  );
}
