import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the ESPN adapter so getCachedFixtures has a deterministic, countable
// upstream and never touches the network.
const fetchAllFixtures = vi.fn();
vi.mock("@/lib/espn", () => ({
  fetchAllFixtures: (...args: unknown[]) => fetchAllFixtures(...args),
}));

import { getCachedFixtures } from "@/lib/fixture-cache";

const BASE = new Date("2026-06-20T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

// A non-empty result so the cache uses the type-based TTL rather than the short
// empty-result TTL.
const oneMatch = [{ id: "1" }] as any;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  fetchAllFixtures.mockReset();
  fetchAllFixtures.mockResolvedValue(oneMatch);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCachedFixtures TTL by match state", () => {
  it("keeps a range containing an in-play match fresh (~15s TTL)", async () => {
    // start in the past, end in the future → classified as "live".
    const range = { start: new Date(BASE - DAY), end: new Date(BASE + DAY) };

    await getCachedFixtures(range);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(1);

    // Within 15s → served from cache, no refetch.
    vi.setSystemTime(BASE + 10_000);
    await getCachedFixtures(range);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(1);

    // Past 15s → live data must refresh.
    vi.setSystemTime(BASE + 16_000);
    await getCachedFixtures(range);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(2);
  });

  it("caches finished (past) ranges far longer than the live TTL", async () => {
    // Both ends in the past → classified as "past" (30 min TTL).
    const range = { start: new Date(BASE - 3 * DAY), end: new Date(BASE - DAY) };

    await getCachedFixtures(range);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(1);

    // 16s later — would have expired a live entry, but a past entry is still warm.
    vi.setSystemTime(BASE + 16_000);
    await getCachedFixtures(range);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(1);
  });

  it("honours an explicit TTL override (e.g. the /live route's 15s)", async () => {
    // Distinct range from the other tests — the cache is module-level and
    // persists across cases, so a shared key would hide the refetch.
    const range = { start: new Date(BASE - 6 * DAY), end: new Date(BASE - 5 * DAY) };

    await getCachedFixtures(range, 15_000);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(1);

    // Override beats the 30-min "past" default → refetches after 16s.
    vi.setSystemTime(BASE + 16_000);
    await getCachedFixtures(range, 15_000);
    expect(fetchAllFixtures).toHaveBeenCalledTimes(2);
  });
});
