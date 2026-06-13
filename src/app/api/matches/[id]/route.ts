import { NextResponse } from "next/server";
import { fetchMatchDetailsById, fetchMatchDetails, getMatchSummary, summaryToMatch, COMPETITION_SLUGS } from "@/lib/espn";
import { fetchFotmobMatchId, fetchFotmobMatchData, applyFotmobRatings, applyFotmobPositions } from "@/lib/fotmob";
import { normaliseName } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Fast path: try to fetch the summary directly by ID, without hitting
    // the scoreboard waterfall (which fetches every competition endpoint).
    // When the caller knows the ESPN slug (threaded from the matches list),
    // pass it so we skip the trial-and-error slug loop entirely.
    // Only honour a slug we recognise — it is interpolated into the ESPN URL,
    // so an arbitrary value must never reach the fetch.
    const slugParam = new URL(req.url).searchParams.get("slug") ?? undefined;
    const knownSlug = COMPETITION_SLUGS.some((c) => c.slug === slugParam) ? slugParam : undefined;
    let detailed = await fetchMatchDetailsById(params.id, knownSlug);

    if (!detailed) {
      // Fallback: search through fixtures list
      const MAX_DATE = new Date("2026-07-30T23:59:59Z");
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      const endCapped = end > MAX_DATE ? MAX_DATE : end;

      const { getCachedFixtures } = await import("@/lib/fixture-cache");
      const fixtures = await getCachedFixtures({ start, end: endCapped });
      const found = fixtures.find((m) => m.id === params.id);
      if (!found) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
      detailed = await fetchMatchDetails(found);
    }

    if (!detailed) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // For live matches the fast path used getMatchSummary with isLive=false (revalidate=60).
    // Re-call with isLive=true so Next.js adopts the shorter 15s revalidation for this URL,
    // ensuring the ESPN data cache expires every 15 s on subsequent requests.
    if (detailed.status === "IN_PLAY" || detailed.status === "PAUSED") {
      const liveSlug = knownSlug ?? detailed.espnSlug ?? "fifa.world";
      const liveSummary = await getMatchSummary(params.id, liveSlug, true, false);
      if (liveSummary) {
        const comp = COMPETITION_SLUGS.find((c) => c.slug === liveSlug);
        const fresh = summaryToMatch(liveSummary, comp ?? {
          slug: liveSlug,
          matchType: detailed.matchType,
          name: detailed.competition.name,
        });
        if (fresh) detailed = { ...fresh, id: params.id };
      }
    }

    // -- FotMob enrichment (ratings / positions / MOTM) --
    // Runs for finished/live matches and for SCHEDULED matches once a confirmed
    // XI exists: FotMob publishes the formation (e.g. 4-2-3-1) and precise pitch
    // positions ~1h before kickoff, which is what drives the PitchView. For
    // scheduled (and live) matches the FotMob page is still changing, so we
    // bypass the 24h match-data cache to avoid pinning an empty pre-lineup result.
    // For scheduled matches only enrich once ESPN has flagged a starting XI —
    // far-out fixtures expose a full squad with no starters, and enriching those
    // would hit FotMob (cache-bypassed) on every page view for no benefit.
    const hasConfirmedXI = Boolean(
      detailed.lineups &&
        (detailed.lineups.home.some((p) => p.starter) ||
          detailed.lineups.away.some((p) => p.starter))
    );
    if (
      (detailed.status === "FINISHED" ||
        detailed.status === "IN_PLAY" ||
        detailed.status === "PAUSED" ||
        (detailed.status === "SCHEDULED" && hasConfirmedXI)) &&
      detailed.lineups
    ) {
      try {
        const isLive = detailed.status === "IN_PLAY" || detailed.status === "PAUSED";
        const isScheduled = detailed.status === "SCHEDULED";
        const fotmobId = await fetchFotmobMatchId(
          detailed.kickoff,
          detailed.home.name,
          detailed.away.name
        );
        if (fotmobId) {
          const fotmobData = await fetchFotmobMatchData(fotmobId, isLive || isScheduled);
          if (fotmobData) {
            if (fotmobData.ratings) {
              detailed.lineups = {
                home: applyFotmobRatings(detailed.lineups.home, fotmobData.ratings),
                away: applyFotmobRatings(detailed.lineups.away, fotmobData.ratings),
              };
            }
            if (fotmobData.formation) {
              detailed.lineups = {
                home: applyFotmobPositions(detailed.lineups.home, fotmobData.lineup?.home, fotmobData.formation.home),
                away: applyFotmobPositions(detailed.lineups.away, fotmobData.lineup?.away, fotmobData.formation.away),
              };
              detailed.formation = fotmobData.formation;
            }
          }

          // Override MOTM with FotMob data if available
          const fotmobMotm = fotmobData?.motm;
          if (fotmobMotm && fotmobMotm.name) {
            const motmTeamNorm = normaliseName(fotmobMotm.teamName);
            const isHome = motmTeamNorm === normaliseName(detailed.home.name);
            const isAway = motmTeamNorm === normaliseName(detailed.away.name);
            const team = isHome ? "home" : isAway ? "away" : undefined;

            if (team) {
              detailed.motm = { name: fotmobMotm.name, team };
              const fotmobNameNorm = normaliseName(fotmobMotm.name);
              const lineup = detailed.lineups[team];
              for (const p of lineup) {
                if (normaliseName(p.name) === fotmobNameNorm) {
                  p.motm = true;
                  break;
                }
              }
            }
          }
        }
      } catch {
        // Best-effort – fall back to ESPN ratings.
      }
    }

    // -- Synthetic substitution events from lineup timing --
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

    const cacheSeconds = detailed.status === "FINISHED" ? 3600 : 15;

    return NextResponse.json(
      { match: detailed },
      { headers: { "Cache-Control": `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}` } }
    );
  } catch (err) {
    console.error("match detail failed", err);
    return NextResponse.json(
      { error: "Failed to load match" },
      { status: 500 }
    );
  }
}
