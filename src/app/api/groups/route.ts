import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/fetch";

export const dynamic = "force-dynamic";

interface StandingsEntry {
  team: {
    id: string;
    name: string;
    abbreviation: string;
    displayName: string;
    location: string;
    logos?: { href: string; width: number; height: number }[];
    isNational: boolean;
  };
  note?: {
    color?: string;
    description?: string;
    rank?: number;
  };
  stats: {
    name: string;
    displayValue: string;
    value?: number;
    summary?: string;
  }[];
}

interface StandingsGroup {
  id: string;
  name: string;
  abbreviation: string;
  standings: {
    entries: StandingsEntry[];
  };
}

interface EspnStandingsResponse {
  children?: StandingsGroup[];
}

export interface GroupInfo {
  id: string;
  name: string;
  entries: {
    teamId: string;
    name: string;
    abbreviation: string;
    logo?: string;
    position: number;
    gamesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    points: number;
    advanced: boolean;
    eliminated: boolean;
  }[];
}

export async function GET() {
  try {
    const data = await fetchJson<EspnStandingsResponse>(
      "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
      { next: { revalidate: 120 }, silent4xx: true }
    );

    if (!data?.children) {
      return NextResponse.json({ groups: [] });
    }

    const groups: GroupInfo[] = data.children.map((child) => {
      const entries = (child.standings?.entries ?? []).map((e) => {
        const stats = Object.fromEntries(
          e.stats.map((s: any) => [s.name, s])
        );
        return {
          teamId: e.team.id,
          name: e.team.displayName ?? e.team.name,
          abbreviation: e.team.abbreviation,
          logo: e.team.logos?.[0]?.href,
          position: stats.rank?.value ?? 0,
          gamesPlayed: stats.gamesPlayed?.value ?? 0,
          wins: stats.wins?.value ?? 0,
          draws: stats.ties?.value ?? 0,
          losses: stats.losses?.value ?? 0,
          goalsFor: stats.pointsFor?.value ?? 0,
          goalsAgainst: stats.pointsAgainst?.value ?? 0,
          goalDiff: stats.pointDifferential?.value ?? 0,
          points: stats.points?.value ?? 0,
          advanced:
            e.note?.description?.toLowerCase().includes("advance") ?? false,
          eliminated:
            e.note?.description?.toLowerCase().includes("eliminated") ?? false,
        };
      });

      return {
        id: child.id,
        name: child.name,
        entries,
      };
    });

    return NextResponse.json(
      { groups },
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("groups fetch failed", err);
    return NextResponse.json(
      { error: "Failed to fetch group standings", detail: String(err) },
      { status: 500 }
    );
  }
}
