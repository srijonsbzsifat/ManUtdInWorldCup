import { fetchAllFixtures } from "@/lib/espn";
import type { Match } from "@/types";

/**
 * Fixture cache TTLs:
 * - Past matches (finished): data never changes, long TTL
 * - Future / mixed ranges: medium TTL
 * - Empty results: very short TTL — likely a transient ESPN failure, retry soon
 */
const FIXTURE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min for future ranges
const LIVE_RESULT_TTL_MS = 15_000;            // 15 s — range spans an in-play match
const EMPTY_RESULT_TTL_MS = 15_000;           // 15 s — don't poison the cache
const MAX_CACHE_ENTRIES = 50;

interface FixtureCacheEntry {
    expiresAt: number;
    fixtures: Match[];
    type: "past" | "future" | "live";
}

const fixtureCache = new Map<string, FixtureCacheEntry>();

// In-flight requests keyed by cache key — prevents concurrent cold-start bursts
// from firing multiple identical ESPN calls simultaneously.
const inflight = new Map<string, Promise<Match[]>>();

function evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of fixtureCache.entries()) {
        if (now >= entry.expiresAt) fixtureCache.delete(key);
    }
    if (fixtureCache.size > MAX_CACHE_ENTRIES) {
        const toDelete = fixtureCache.size - MAX_CACHE_ENTRIES;
        let i = 0;
        for (const key of fixtureCache.keys()) {
            if (i >= toDelete) break;
            fixtureCache.delete(key);
            i++;
        }
    }
}

export async function getCachedFixtures(
    dateRange: { start: Date; end: Date },
    overrideTtlMs?: number
): Promise<Match[]> {
    const key = `${dateRange.start.toISOString().slice(0, 10)}|${dateRange.end.toISOString().slice(0, 10)}`;

    evictStale();

    const entry = fixtureCache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        return entry.fixtures;
    }

    // Coalesce: if an identical fetch is already in-flight, wait for it.
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = fetchAllFixtures({ dateRange }).then((fixtures) => {
        const now = Date.now();
        const isPast = dateRange.end.getTime() < now;
        const isFuture = dateRange.start.getTime() > now;
        const type = isPast ? "past" : isFuture ? "future" : "live";

        // TTL by match-state classification:
        //   - empty:  short, so transient ESPN failures don't poison the cache
        //   - past:   long, finished fixtures never change
        //   - live:   short, the range spans a match that may be in play right
        //             now — score/minute/status must stay fresh everywhere, not
        //             just on the dedicated /live route
        //   - future: medium, lineups may appear but nothing is in flux
        const ttl = fixtures.length === 0
            ? EMPTY_RESULT_TTL_MS
            : overrideTtlMs ?? (
                type === "past" ? 30 * 60 * 1000
                : type === "live" ? LIVE_RESULT_TTL_MS
                : FIXTURE_CACHE_TTL_MS
            );

        fixtureCache.set(key, { expiresAt: Date.now() + ttl, fixtures, type });
        return fixtures;
    }).finally(() => {
        inflight.delete(key);
    });

    inflight.set(key, promise);
    return promise;
}
