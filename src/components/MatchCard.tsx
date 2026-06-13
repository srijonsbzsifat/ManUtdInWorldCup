import Link from "next/link";
import { StatusPill } from "./StatusPill";
import { RatingBadge } from "./RatingBadge";
import { NationFlag } from "./NationFlag";
import { formatDate, formatTimeLocal } from "@/lib/utils";
import type { Match, LineupPlayer } from "@/types";
import { findUnitedPlayersInLineup } from "@/lib/aggregator";
import React from "react";

function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const homeHasUnitedPlayer = match.lineups
    ? findUnitedPlayersInLineup(match.lineups.home).length > 0
    : false;
  const awayHasUnitedPlayer = match.lineups
    ? findUnitedPlayersInLineup(match.lineups.away).length > 0
    : false;
  const ourPlayers = match.lineups
    ? [
      ...findUnitedPlayersInLineup(match.lineups.home),
      ...findUnitedPlayersInLineup(match.lineups.away),
    ]
    : [];

  return (
    <Link
      href={match.espnSlug ? `/matches/${match.id}?slug=${match.espnSlug}` : `/matches/${match.id}`}
      className="glass glass-hover p-4 block group"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50 font-medium">
          <span>{match.competition.name}</span>
          {match.matchType === "friendly" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
              Friendly
            </span>
          )}
        </div>
        <StatusPill status={match.status} minute={match.minute} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamColumn team={match.home} align="right" highlight={homeHasUnitedPlayer} />
        <div className="text-center px-2 min-w-[60px]">
          {match.status === "SCHEDULED" ? (
            <div>
              <div className="text-[11px] text-white/50 font-medium">
                {formatDate(match.kickoff)}
              </div>
              <div className="text-xl font-bold tabular-nums leading-tight">
                {formatTimeLocal(match.kickoff)}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {match.score.home ?? 0} - {match.score.away ?? 0}
              </div>
              <div className="text-[10px] text-white/50 mt-0.5">
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
        <TeamColumn team={match.away} align="left" highlight={awayHasUnitedPlayer} />
      </div>

      {ourPlayers.length > 0 && !compact && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
          <div className="text-white/50">
            {ourPlayers.length} {ourPlayers.length === 1 ? "Red Devil" : "Red Devils"} involved
          </div>
          <div className="flex items-center gap-1.5">
            {ourPlayers.slice(0, 3).map((p) => (
              <PlayerChip key={p.id} player={p} />
            ))}
            {ourPlayers.length > 3 && (
              <span className="text-white/40 text-[10px]">+{ourPlayers.length - 3}</span>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}

function TeamColumn({
  team,
  align,
  highlight,
}: {
  team: Match["home"];
  align: "left" | "right";
  highlight: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div
        className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10 shadow-sm bg-white"
        style={{
          background: `linear-gradient(135deg, ${team.color}22 0%, ${team.color}55 100%)`,
        }}
        aria-label={`${team.name} flag`}
      >
        <div className="flex flex-col items-center justify-center w-full h-full">
          <NationFlag
            code={team.code}
            shortName={team.shortName ?? team.name}
            emoji={team.flag}
            size={28}
            title={`${team.name} flag`}
          />
          <span
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ background: team.color }}
            aria-hidden
          />
        </div>
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-semibold truncate ${highlight ? "text-united-gold" : "text-white"}`}>
          {team.shortName || team.name}
        </div>
        <div className="text-[10px] text-white/40 truncate">
          {team.code}
        </div>
      </div>
    </div>
  );
}

function PlayerChip({ player }: { player: LineupPlayer }) {
  return (
    <div
      className="flex items-center gap-1 bg-white/5 rounded-full pl-1 pr-2 py-0.5"
      title={player.name}
    >
      <span className="w-5 h-5 rounded-full bg-united-red/80 text-white text-[10px] font-bold flex items-center justify-center">
        {player.shirtNumber || "•"}
      </span>
      <span className="text-white/80 text-[11px] truncate max-w-[80px]">
        {player.name.split(" ").pop()}
      </span>
      {player.rating !== null && player.rating !== undefined && (
        <span
          className={`text-[10px] font-bold px-1.5 rounded ${player.rating >= 7
            ? "bg-emerald-500/30 text-emerald-300"
            : player.rating >= 6
              ? "bg-yellow-500/30 text-yellow-300"
              : "bg-red-500/30 text-red-300"
            }`}
        >
          {player.rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export default React.memo(MatchCard);