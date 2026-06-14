import { NextResponse } from "next/server";
import { fetchMatchDetailsById, fetchMatchDetails, COMPETITION_SLUGS } from "@/lib/espn";
import { fetchFotmobMatchId, fetchFotmobMatchData, applyFotmobRatings, applyFotmobPositions, buildLineupsFromFotmob, isPredictedLineupType } from "@/lib/fotmob";
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

    // -- Predicted lineup for upcoming fixtures (FotMob) --
    // For SCHEDULED matches with no confirmed ESPN XI, ESPN has no roster, so the
    // block above can't run. Build the lineup directly from FotMob's PREDICTED XI
    // instead, so upcoming fixtures show a formation pitch view like FotMob does.
    // Gated to a near-kickoff window (FotMob only publishes predicted XIs close to
    // the match) and uses the cached FotMob fetch so the 15s SWR poll is cheap.
    const PREDICTED_WINDOW_MS = 1000 * 60 * 60 * 24 * 2; // 2 days
    if (
      detailed.status === "SCHEDULED" &&
      !hasConfirmedXI &&
      !detailed.lineups
    ) {
      const ms = new Date(detailed.kickoff).getTime() - Date.now();
      if (ms > 0 && ms <= PREDICTED_WINDOW_MS) {
        try {
          const fotmobId = await fetchFotmobMatchId(
            detailed.kickoff,
            detailed.home.name,
            detailed.away.name
          );
          if (fotmobId) {
            // Within the last hour the official XI gets published and FotMob
            // flips lineupType predicted → confirmed. Bypass the 24h cache in
            // that window so a stale predicted result can't mask the confirmed
            // lineup. Earlier than that, predicted XIs change slowly → cache.
            const CONFIRM_WINDOW_MS = 1000 * 60 * 60; // 1 hour
            const bypassCache = ms <= CONFIRM_WINDOW_MS;
            const fotmobData = await fetchFotmobMatchData(fotmobId, bypassCache);
            const built = fotmobData?.lineup ? buildLineupsFromFotmob(fotmobData.lineup) : null;
            if (
              built &&
              fotmobData?.formation &&
              (fotmobData.formation.home || fotmobData.formation.away)
            ) {
              detailed.lineups = built;
              detailed.formation = fotmobData.formation;
              // Honour FotMob's own flag: once it reports a confirmed XI, drop the
              // "Predicted" label so the confirmed lineup takes precedence.
              detailed.lineupPredicted = isPredictedLineupType(fotmobData.lineupType);
            }
          }
        } catch {
          // Best-effort: leave as a normal scheduled match with no lineup.
        }
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
