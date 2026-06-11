import { fetchAllFixtures } from "@/lib/espn";
import type { Match } from "@/types";

/**
 * Fixture cache TTLs:
 * - Past matches (finished): data never changes, long TTL
 * - Future matches: may change (postponements, scheduling), medium TTL
 * - Live matches: handled by 15s revalidation in ESPN adapter
 */
const FIXTURE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for past + future
const MAX_CACHE_ENTRIES = 50;

interface FixtureCacheEntry {
    expiresAt: number;
    fixtures: Match[];
    /** Track whether these fixtures are from past or future to aid debug */
    type: "past" | "future" | "live";
}

// Map key: "YYYY-MM-DD|YYYY-MM-DD"
const fixtureCache = new Map<string, FixtureCacheEntry>();

/**
 * Evict stale entries to prevent unbounded memory growth in serverless env.
 * Called on every get/set.
 */
function evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of fixtureCache.entries()) {
        if (now >= entry.expiresAt) {
            fixtureCache.delete(key);
        }
    }
    // Also enforce max size
    if (fixtureCache.size > MAX_CACHE_ENTRIES) {
        // Delete oldest entries (Map preserves insertion order)
        const toDelete = fixtureCache.size - MAX_CACHE_ENTRIES;
        let i = 0;
        for (const key of fixtureCache.keys()) {
            if (i >= toDelete) break;
            fixtureCache.delete(key);
            i++;
        }
    }
}

/**
 * Get fixtures for a date range, using an in-memory cache keyed by
 * date slice. Avoids repeated ESPN scoreboard waterfalls.
 */
export async function getCachedFixtures(dateRange: { start: Date; end: Date }): Promise<Match[]> {
    const key = `${dateRange.start.toISOString().slice(0, 10)}|${dateRange.end.toISOString().slice(0, 10)}`;

    // Evict stale entries first
    evictStale();

    const entry = fixtureCache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        return entry.fixtures;
    }

    const fixtures = await fetchAllFixtures({ dateRange });

    // Determine cache type based on dates
    const now = Date.now();
    const isPast = dateRange.end.getTime() < now;
    const isFuture = dateRange.start.getTime() > now;
    const type = isPast ? "past" : isFuture ? "future" : "live";

    // Longer TTL for past data (never changes)
    const ttl = isPast ? 30 * 60 * 1000 : FIXTURE_CACHE_TTL_MS;

    fixtureCache.set(key, {
        expiresAt: Date.now() + ttl,
        fixtures,
        type,
    });

    return fixtures;
}