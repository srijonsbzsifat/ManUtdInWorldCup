"use client";
import useSWR from "swr";
import Link from "next/link";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { GroupInfo } from "@/app/api/groups/route";
import { UNITED_PLAYERS } from "@/lib/players";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const muNationCodes = new Set(
  UNITED_PLAYERS.map((p) => p.nation.code)
);

export default function GroupsPage() {
  const { data, error, isLoading } = useSWR<{ groups: GroupInfo[] }>(
    "/api/groups",
    fetcher,
    { refreshInterval: 60_000 }
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Group Standings</h1>
        <p className="text-sm text-white/50 mt-1">
          2026 FIFA World Cup — group stage tables
        </p>
      </div>

      {isLoading && (
        <LoadingSpinner text="Loading group standings..." />
      )}

      {error && (
        <div className="glass p-8 text-center">
          <p className="text-base font-semibold mb-1">Could not load standings</p>
          <p className="text-sm text-white/50">
            Group tables are not available at the moment.
          </p>
        </div>
      )}

      {data?.groups && data.groups.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.groups.map((group) => (
            <GroupTable key={group.id} group={group} />
          ))}
        </div>
      )}

      {data?.groups && data.groups.length === 0 && (
        <div className="glass p-8 text-center">
          <p className="text-sm text-white/50">
            Group standings are not yet available.
          </p>
        </div>
      )}
    </div>
  );
}

function GroupTable({ group }: { group: GroupInfo }) {
  return (
    <div className="glass p-4">
      <h2 className="text-sm font-semibold mb-3">{group.name}</h2>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-white/40 border-b border-white/5">
            <th className="text-left py-1 pr-1 w-6">#</th>
            <th className="text-left py-1 pr-2">Team</th>
            <th className="text-center py-1 px-1">P</th>
            <th className="text-center py-1 px-1">W</th>
            <th className="text-center py-1 px-1">D</th>
            <th className="text-center py-1 px-1">L</th>
            <th className="text-center py-1 px-1">GD</th>
            <th className="text-center py-1 px-1.5">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.entries
            .sort((a, b) => a.position - b.position)
            .map((entry) => {
              const hasMuPlayer = muNationCodes.has(entry.abbreviation);
              return (
                <tr
                  key={entry.teamId}
                  className={`border-b border-white/5 ${
                    entry.advanced ? "opacity-100" : entry.eliminated ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-1.5 pr-1 text-white/40 font-mono tabular-nums">
                    {entry.position}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      {entry.logo && (
                        <img
                          src={entry.logo}
                          alt=""
                          className="w-4 h-4 object-contain flex-shrink-0"
                        />
                      )}
                      <span className="truncate font-medium">
                        {entry.abbreviation}
                      </span>
                      {hasMuPlayer && (
                        <span
                          className="text-[10px] text-united-gold flex-shrink-0"
                          title="Has a Manchester United player"
                        >
                          ⭐
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-center py-1.5 px-1 tabular-nums">
                    {entry.gamesPlayed}
                  </td>
                  <td className="text-center py-1.5 px-1 tabular-nums text-emerald-400">
                    {entry.wins}
                  </td>
                  <td className="text-center py-1.5 px-1 tabular-nums text-amber-400">
                    {entry.draws}
                  </td>
                  <td className="text-center py-1.5 px-1 tabular-nums text-red-400">
                    {entry.losses}
                  </td>
                  <td
                    className={`text-center py-1.5 px-1 tabular-nums font-mono ${
                      entry.goalDiff > 0
                        ? "text-emerald-400"
                        : entry.goalDiff < 0
                          ? "text-red-400"
                          : "text-white/60"
                    }`}
                  >
                    {entry.goalDiff > 0 ? "+" : ""}
                    {entry.goalDiff}
                  </td>
                  <td className="text-center py-1.5 px-1.5 tabular-nums font-bold">
                    {entry.points}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
