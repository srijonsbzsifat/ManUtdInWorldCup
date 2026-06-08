"use client";
import { useState, useMemo } from "react";
import Image from "next/image";
import useSWR from "swr";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Select } from "@/components/Select";
import { UNITED_PLAYERS } from "@/lib/players";
import type { NewsItem } from "@/lib/news";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

const allPlayerOptions = UNITED_PLAYERS.map((p) => ({
  id: p.id,
  name: p.shortName || p.name.split(" ").pop()!,
  nation: p.nation,
})).sort((a, b) => a.name.localeCompare(b.name));

export default function NewsPage() {
  const [playerFilter, setPlayerFilter] = useState<string>("All");

  const { data, isLoading } = useSWR<{ news: NewsItem[] }>(
    "/api/news",
    { refreshInterval: 120_000 }
  );

  const filtered = useMemo(() => {
    const items = data?.news ?? [];
    if (playerFilter === "All") return items;
    return items.filter((n) => n.playerId === playerFilter);
  }, [data, playerFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">News & Highlights</h1>
          <p className="text-sm text-white/50 mt-1">
            Latest stories featuring Manchester United players on international
            duty.
          </p>
        </div>
        <Select
          value={playerFilter}
          onChange={setPlayerFilter}
          options={allPlayerOptions.map((p) => ({ value: p.id, label: p.name }))}
          allLabel="All players"
        />
      </header>

      {isLoading && <LoadingSpinner text="Fetching latest news..." />}

      {!isLoading && filtered.length === 0 && (
        <div className="glass p-12 text-center">
          <p className="text-white/50 text-sm">No news stories found.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((item, i) => (
          <NewsCard key={`${item.playerId}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const player = UNITED_PLAYERS.find((p) => p.id === item.playerId);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="glass glass-hover p-4 block group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {player?.imageUrl ? (
            <Image
              src={player.imageUrl}
              alt={item.playerName}
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs font-bold text-white/60">
              {item.shortName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">
              {item.shortName}
            </span>
            <span className="text-[11px] text-white/40">
              {item.nationName}
            </span>
          </div>
          <h3 className="text-sm text-white/90 leading-snug group-hover:text-white transition-colors">
            {item.title}
          </h3>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-white/40">
            <span>{item.source}</span>
            <span>·</span>
            <span>{timeAgo(item.publishedAt)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}
