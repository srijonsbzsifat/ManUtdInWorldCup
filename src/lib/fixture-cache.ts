import { fetchAllFixtures } from "@/lib/espn";
import type { Match } from "@/types";

const FIXTURE_CACHE_TTL_MS = 5 * 60 * 1000;

interface FixtureCacheEntry {
    key: string;
    expiresAt: number;
    fixtures: Match[];
}

let fixtureCache: FixtureCacheEntry | null = null;

/**
 * Get fixtures for a date range, using a simple in-memory cache keyed by
 * date slice (YYYY-MM-DD|YYYY-MM-DD).  Avoids repeated ESPN scoreboard
 * waterfalls when multiple API routes need fixtures in the same window.
 *
 * The cache is intentionally a singleton so it survives across requests
 * within the same Node.js process (and between revalidations in dev).
 */
export async function getCachedFixtures(dateRange: { start: Date; end: Date }): Promise<Match[]> {
    const key = `${dateRange.start.toISOString().slice(0, 10)}|${dateRange.end.toISOString().slice(0, 10)}`;
    if (fixtureCache && fixtureCache.key === key && Date.now() < fixtureCache.expiresAt) {
        return fixtureCache.fixtures;
    }

    const fixtures = await fetchAllFixtures({ dateRange });
    fixtureCache = {
        key,
        expiresAt: Date.now() + FIXTURE_CACHE_TTL_MS,
        fixtures,
    };
    return fixtures;
}

/**
 * Clear the fixture cache (useful for testing or forced refreshes).
 */
export function clearFixtureCache(): void {
    fixtureCache = null;
}