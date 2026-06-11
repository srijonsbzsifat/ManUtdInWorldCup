import { NextResponse } from "next/server";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const MAX_DATE = new Date("2026-07-30T23:59:59Z");

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    const endCapped = end > MAX_DATE ? MAX_DATE : end;

    const fixtures = await fetchAllFixtures({ dateRange: { start, end: endCapped } });
    const found = fixtures.find((m) => m.id === params.id);
    if (!found) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const detailed = await fetchMatchDetails(found);

    // ESPN play-by-play rarely includes substitution data for international fixtures.
    // Reconstruct substitution events from FotMob lineup timing instead.
    if (detailed.lineups && !detailed.events.some(e => e.type === "substitution")) {
      const syntheticSubs: typeof detailed.events = [];
      for (const side of ["home", "away"] as const) {
        const lineup = detailed.lineups[side];
        const outByMinute = new Map<number, { id: string; name: string }[]>();
        for (const p of lineup) {
          if (p.starter && p.subOffMinute != null) {
            const bucket = outByMinute.get(p.subOffMinute) ?? [];
            bucket.push({ id: p.id, name: p.name });
            outByMinute.set(p.subOffMinute, bucket);
          }
        }
        for (const p of lineup) {
          if (!p.starter && p.subOnMinute != null) {
            const outList = outByMinute.get(p.subOnMinute) ?? [];
            const outPlayer = outList.shift();
            syntheticSubs.push({
              id: `sub-${side}-${p.subOnMinute}-${p.id}`,
              minute: p.subOnMinute,
              type: "substitution",
              team: side,
              player: { id: p.id, name: p.name },
              ...(outPlayer && { detail: `On for ${outPlayer.name}` }),
            });
          }
        }
      }
      if (syntheticSubs.length > 0) {
        detailed.events = [...detailed.events, ...syntheticSubs].sort((a, b) =>
          a.minute !== b.minute ? a.minute - b.minute : (a.stoppage ?? 0) - (b.stoppage ?? 0)
        );
      }
    }

    const cacheSeconds = detailed.status === "FINISHED" ? 3600 : 30;

    return NextResponse.json(
      { match: detailed },
      { headers: { "Cache-Control": `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}` } }
    );
  } catch (err) {
    console.error("match detail failed", err);
    return NextResponse.json(
      { error: "Failed to load match", detail: String(err) },
      { status: 500 }
    );
  }
}
