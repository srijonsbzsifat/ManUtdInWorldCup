# Manchester United @ World Cup

Live dashboard tracking every Manchester United player on international duty at the **2026 FIFA World Cup** and friendlies — built with Next.js 14, TypeScript, and Tailwind.

Shows real player ratings (scraped from FotMob), MOTM, lineups, group standings, match events, and aggregated stats per player.

---

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** with custom Manchester United theme
- **SWR** for client-side auto-refresh on live data
- **ESPN public API** — scoreboard, summaries, standings (no auth)
- **FotMob** — match ID lookup + real player ratings + MOTM (scraped)

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```

Requires Node 18.17+ (Node 20+ recommended).

---

## Pages

| Path | Description |
|------|-------------|
| `/` | Dashboard — upcoming matches, MOTM leaderboard, player stats |
| `/players` | All United players with search, position & nation filters |
| `/players/[id]` | Player detail — aggregate stats + match-by-match log |
| `/matches` | All fixtures involving United nations, filterable by status/nation |
| `/matches/[id]` | Match detail — score, lineups with FotMob ratings, events timeline |
| `/groups` | World Cup group standings (A-L) with MU-nation indicators |
| `/news` | Latest news articles for each United player (Google News RSS) |
| `/live` | Auto-refreshing live match ticker |

---

## How data works

1. **ESPN** provides the fixture list, match summaries, lineups, events, and standings — no API key needed.
2. **FotMob** is scraped for finished matches to get real player ratings (1–10) and Man of the Match — replaces ESPN's absence of rating data.
3. **Fallback chain**: FotMob rating → ESPN stat-based computed rating → `null`.

Player ratings are cached in memory and refreshed per request. Live matches skip FotMob scraping to avoid errors on incomplete data.

---

## Editing the squad

Edit `src/lib/players.ts` — add or remove a player and they appear across the app. Names are matched automatically against ESPN rosters at runtime.

---

## Deploy to Vercel

1. Push to GitHub.
2. Import at [vercel.com/new](https://vercel.com/new).
3. No build settings need changing — Vercel auto-detects Next.js.
4. Deploy. Every commit to `main` triggers a production build.

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── groups/route.ts    # World Cup standings
│   │   ├── matches/route.ts   # All fixtures
│   │   ├── matches/[id]/      # Single match detail
│   │   └── news/route.ts      # Player news (Google RSS)
│   ├── groups/                # Group standings page
│   ├── live/                  # Live ticker page
│   ├── matches/               # Match list + detail pages
│   ├── news/                  # News page
│   ├── players/               # Player list + detail pages
│   └── page.tsx               # Dashboard
├── components/                # Reusable UI components
├── lib/
│   ├── aggregator.ts          # Match[] → per-player stats
│   ├── espn.ts                # ESPN API adapter
│   ├── fetch.ts               # fetchJson with timeout/caching
│   ├── flags.ts               # Flag image helpers
│   ├── fotmob.ts              # FotMob scraper (ratings + MOTM)
│   ├── news.ts                # Google News RSS parser
│   ├── players.ts             # United squad data
│   └── utils.ts               # Formatters, cn(), rating helpers
└── types/index.ts             # Domain types
```

---

## License

Unofficial fan project. Not affiliated with Manchester United, FIFA, ESPN, or FotMob.
