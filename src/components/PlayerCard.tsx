import Link from "next/link";
import type { UnitedPlayer, PlayerTournamentStats } from "@/types";
import { RatingBadge } from "./RatingBadge";
import { PlayerAvatar } from "./PlayerAvatar";

export function PlayerCard({
  player,
  stats,
  rank,
}: {
  player: UnitedPlayer;
  stats: PlayerTournamentStats;
  rank?: number;
}) {
  return (
    <Link
      href={`/players/${player.id}`}
      className="glass glass-hover p-4 block"
    >
      <div className="flex items-start gap-3">
        {rank && (
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-white/60">
            #{rank}
          </div>
        )}
        <PlayerAvatar player={player} size={48} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
            {player.name}
            {player.loaned && (
              <span className="text-[9px] uppercase font-bold tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Loan
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/50 flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/70 font-medium">
              {player.position}
            </span>
            <span>{player.nation.name}</span>
          </div>
        </div>
        <RatingBadge rating={stats.averageRating} size="sm" />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Apps" value={stats.matches} />
        {player.position === "GK" ? (
          <>
            <Stat label="CS" value={stats.cleanSheets} highlight={stats.cleanSheets > 0} />
            <Stat label="Saves" value={stats.saves} highlight={stats.saves > 0} />
            <Stat label="Min" value={stats.minutesPlayed} />
          </>
        ) : (
          <>
            <Stat label="Goals" value={stats.goals} highlight={stats.goals > 0} />
            <Stat label="Ast" value={stats.assists} highlight={stats.assists > 0} />
            <Stat label="Min" value={stats.minutesPlayed} />
          </>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, highlight, warn }: { label: string; value: number; highlight?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className={`text-base font-bold tabular-nums ${highlight ? "text-emerald-400" : warn ? "text-red-400" : "text-white"}`}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
