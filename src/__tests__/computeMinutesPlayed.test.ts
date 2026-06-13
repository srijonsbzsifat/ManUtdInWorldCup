import { describe, it, expect } from "vitest";
import { computeMinutesPlayed } from "@/lib/espn";

describe("computeMinutesPlayed", () => {
  it("starter who plays the full match gets the match duration", () => {
    expect(computeMinutesPlayed(true, null, null, 90)).toBe(90);
    expect(computeMinutesPlayed(true, null, null, 95)).toBe(95);
  });

  it("starter subbed off gets the minute they came off", () => {
    expect(computeMinutesPlayed(true, null, 70, 90)).toBe(70);
  });

  it("substitute still on the pitch gets duration minus on-minute", () => {
    expect(computeMinutesPlayed(false, 60, null, 90)).toBe(30);
  });

  it("substitute subbed on AND off gets only the on-pitch window", () => {
    // On at 60', off at 70' → 10 minutes, NOT 30 (90-60).
    expect(computeMinutesPlayed(false, 60, 70, 90)).toBe(10);
  });

  it("substitute on a live match uses live elapsed as duration", () => {
    // Came on at minute 80 of a match currently at minute 85.
    expect(computeMinutesPlayed(false, 80, null, 85)).toBe(5);
  });

  it("never returns a negative value", () => {
    expect(computeMinutesPlayed(false, 90, null, 80)).toBe(0);
    expect(computeMinutesPlayed(false, 70, 60, 90)).toBe(0);
  });

  it("unused bench player (no on/off) gets 0", () => {
    expect(computeMinutesPlayed(false, null, null, 90)).toBe(0);
  });
});
