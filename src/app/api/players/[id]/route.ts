import { NextResponse } from "next/server";
import { getPlayerById } from "@/lib/players";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";
import { computePlayerPerformances, computeTournamentStats } from "@/lib/aggregator";

export const revalidate = 30;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const player = getPlayerById(params.id);
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    // 30-day lookback plus enough future to cover the rest of the World Cup
    // and any remaining international friendlies.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);

    const fixtures = await fetchAllFixtures({ dateRange: { start, end } });
    // Hydrate details (lineups, events) for every match involving this player's
    // national team - the summary endpoint is heavier so we limit it to the
    // matches we care about.
    const teamMatchSlugs = fixtures.filter(
      (m) => m.home.code === player.nation.code || m.away.code === player.nation.code
    );
    const detailed = await Promise.all(
      teamMatchSlugs.map((m) =>
        m.lineups ? Promise.resolve(m) : fetchMatchDetails(m)
      )
    );

    const performances = computePlayerPerformances(detailed, player.id);
    const tournamentStats = computeTournamentStats(detailed)[player.id];

    return NextResponse.json({
      player,
      performances,
      stats: tournamentStats,
      matchesInWindow: teamMatchSlugs.length,
    });
  } catch (err) {
    console.error("player detail failed", err);
    return NextResponse.json(
      { error: "Failed to load player detail", detail: String(err) },
      { status: 500 }
    );
  }
}
