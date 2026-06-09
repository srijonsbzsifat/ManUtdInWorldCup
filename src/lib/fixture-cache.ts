import { fetchAllFixtures } from "@/lib/espn";
import type { Match } from "@/types";

const FIXTURE_CACHE_TTL_MS = 5 * 60 * 1000;

interface FixtureCacheEntry {
    expiresAt: number;
    fixtures: Match[];
}

// Map key: "YYYY-MM-DD|YYYY-MM-DD"
const fixtureCache = new Map<string, FixtureCacheEntry>();

/**
 * Get fixtures for a date range, using an in-memory cache keyed by
 * date slice. Avoids repeated ESPN scoreboard waterfalls.
 */
export async function getCachedFixtures(dateRange: { start: Date; end: Date }): Promise<Match[]> {
    const key = `${dateRange.start.toISOString().slice(0, 10)}|${dateRange.end.toISOString().slice(0, 10)}`;

    const entry = fixtureCache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        return entry.fixtures;
    }

    const fixtures = await fetchAllFixtures({ dateRange });
    fixtureCache.set(key, {
        expiresAt: Date.now() + FIXTURE_CACHE_TTL_MS,
        fixtures,
    });
    return fixtures;
}

/**
 * Clear the fixture cache.
 */
export function clearFixtureCache(): void {
    fixtureCache.clear();
}