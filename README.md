# Manchester United @ World Cup

Live dashboard tracking every Manchester United player on international duty at the **2026 FIFA World Cup** and friendlies — built with Next.js 14, TypeScript, and Tailwind.

Shows real player ratings (scraped from FotMob), MOTM, lineups, formations, group standings, match events, and aggregated stats per player.

---

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** with custom Manchester United theme
- **SWR** for client-side auto-refresh on live data
- **Vitest** for unit tests
- **ESPN public API** — scoreboard, summaries, standings (no auth)
- **FotMob** — match ID lookup + real player ratings + MOTM + formations (scraped)

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

Requires Node 18.17+ (Node 20+ recommended). No environment variables are needed — the app runs entirely on free public data sources.

---

## Pages

| Path | Description |
|------|-------------|
| `/` | Dashboard — live ticker, player stat leaderboard, upcoming matches |
| `/players` | All United players with search, position & nation filters |
| `/players/[id]` | Player detail — aggregate stats + match-by-match log |
| `/matches` | All fixtures involving United nations, filterable by status/nation |
| `/matches/[id]` | Match detail — score, lineups with FotMob ratings, formation pitch view, events timeline |
| `/groups` | World Cup group standings (A–L) with MU-nation indicators |
| `/news` | Latest news articles for each United player (Google News RSS) |
| `/live` | Auto-refreshing live match ticker |

---

## How data works

1. **ESPN** provides the fixture list, match summaries, lineups, events, and standings — no API key needed.
2. **FotMob** is matched by date + team names (one shared lookup per date) and scraped for real player ratings (1–10), Man of the Match, and team formations / player positions. It is applied to any match that has lineups — both **finished and live** matches.
3. **Rating fallback chain**: FotMob rating → ESPN stat-based computed rating → `null`.

### Caching & performance

- **FotMob match data** is cached in memory with a **24-hour TTL**. Live matches bypass the cache on each fetch so ratings and MOTM refresh as the game progresses; finished-match data is served from cache.
- **Fixtures** are cached in memory (~10 min for active ranges, 30 min for fully-past ranges). Empty results — usually a transient ESPN hiccup — are cached for only 15s so they don't poison the cache, and concurrent identical requests are coalesced into a single upstream fetch.
- Once the tournament is underway, dead qualifier endpoints are skipped and each competition fetch is bounded by a short per-request timeout with a failure cache.
- External fan-out (match-detail enrichment, player news) is bounded with a concurrency limiter. API routes serve shared data with explicit `Cache-Control` (`s-maxage` + `stale-while-revalidate`) headers.

### Stats scope

Per-player tournament stats are computed from `Match[]` in `aggregator.ts`. Once the World Cup starts (11 June 2026) only **World Cup** matches count toward stats; before that, all matches (friendlies/qualifiers) count. Live matches contribute in real time — minutes played use the actual elapsed clock, not a flat 90.

---

## Editing the squad

Edit `src/lib/players.ts` — add or remove a player and they appear across the app. Names are matched automatically against ESPN rosters at runtime (with an alias table for tricky cases).

---

## Testing

```bash
npm test           # run all unit tests once
npm run test:watch # watch mode
```

Tests live in `src/__tests__/` and cover the brittle, high-stakes logic: name matching (`matchUnitedPlayer`, `normaliseName`), stat aggregation (`computeTournamentStats`), minutes-played computation, FotMob extraction, and the concurrency limiter.

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── groups/route.ts      # World Cup standings
│   │   ├── live/route.ts        # Live matches
│   │   ├── matches/route.ts     # All fixtures
│   │   ├── matches/[id]/route.ts# Single match detail (+ FotMob enrichment)
│   │   ├── news/route.ts        # Player news (Google RSS)
│   │   ├── players/route.ts     # Squad list (static)
│   │   ├── players/[id]/route.ts# Player detail + aggregated stats
│   │   └── stats/route.ts       # Tournament stat leaderboard
│   ├── groups/                  # Group standings page
│   ├── live/                    # Live ticker page
│   ├── matches/                 # Match list + detail pages
│   ├── news/                    # News page
│   ├── players/                 # Player list + detail pages
│   ├── error.tsx                # Global error boundary
│   └── page.tsx                 # Dashboard
├── components/
│   ├── SWRProvider.tsx          # Global SWR config (shared fetcher)
│   └── ...                      # Reusable UI components
├── lib/
│   ├── aggregator.ts            # Match[] → per-player stats
│   ├── espn.ts                  # ESPN API adapter (fixtures, summaries, lineups)
│   ├── fetch.ts                 # fetchJson with timeout/caching
│   ├── fixture-cache.ts         # In-memory fixture cache + request coalescing
│   ├── flags.ts                 # Flag image helpers
│   ├── fotmob.ts                # FotMob scraper (ratings + MOTM + formations)
│   ├── news.ts                  # Google News RSS parser
│   ├── players.ts               # United squad data + name matching
│   └── utils.ts                 # Formatters, cn(), rating + concurrency helpers
├── __tests__/                   # Vitest unit tests
└── types/index.ts               # Domain types
```

---

## License

Unofficial fan project. Not affiliated with Manchester United, FIFA, ESPN, or FotMob.
