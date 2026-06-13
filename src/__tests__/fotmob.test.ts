import { describe, it, expect } from "vitest";
import {
  extractFotmobContent,
  extractRatings,
  extractMotm,
  extractFormation,
  applyFotmobRatings,
  applyFotmobPositions,
} from "@/lib/fotmob";

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeHtml(content: unknown): string {
  const data = { props: { pageProps: { content } } };
  return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head><body></body></html>`;
}

const SAMPLE_CONTENT = {
  lineup: {
    homeTeam: {
      formation: "4-3-3",
      starters: [
        { id: 1, name: "André Onana", positionId: 11, performance: { rating: 7.2 } },
        { id: 2, name: "Bruno Fernandes", positionId: 81, performance: { rating: 8.5 } },
      ],
      subs: [
        { id: 3, name: "Kobbie Mainoo", performance: { rating: 6.9 } },
      ],
    },
    awayTeam: {
      formation: "4-2-3-1",
      starters: [
        { id: 4, name: "Lionel Messi", positionId: 100, performance: { rating: 9.1 } },
      ],
      subs: [],
    },
  },
  matchFacts: {
    playerOfTheMatch: { name: "Bruno Fernandes", teamName: "England" },
  },
};

// ── extractFotmobContent ──────────────────────────────────────────────────────

describe("extractFotmobContent", () => {
  it("extracts content from a well-formed page", () => {
    const html = makeHtml(SAMPLE_CONTENT);
    const content = extractFotmobContent(html);
    expect(content).not.toBeNull();
    expect(content).toHaveProperty("lineup");
    expect(content).toHaveProperty("matchFacts");
  });

  it("returns null when __NEXT_DATA__ is absent", () => {
    expect(extractFotmobContent("<html><body>nothing here</body></html>")).toBeNull();
  });

  it("returns null when pageProps.content is missing", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>`;
    expect(extractFotmobContent(html)).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{ not valid json }</script>`;
    expect(extractFotmobContent(html)).toBeNull();
  });

  it("handles multi-line JSON (dotall regex)", () => {
    const data = { props: { pageProps: { content: { lineup: {} } } } };
    // Embed newlines into the JSON to verify the `s` flag works
    const json = JSON.stringify(data, null, 2);
    const html = `<script id="__NEXT_DATA__" type="application/json">\n${json}\n</script>`;
    const content = extractFotmobContent(html);
    expect(content).not.toBeNull();
    expect(content).toHaveProperty("lineup");
  });
});

// ── extractRatings ────────────────────────────────────────────────────────────

describe("extractRatings", () => {
  it("extracts ratings keyed by normalised name", () => {
    const ratings = extractRatings(SAMPLE_CONTENT);
    expect(ratings).not.toBeNull();
    expect(ratings!["andre onana"]).toBe(7.2);
    expect(ratings!["bruno fernandes"]).toBe(8.5);
    expect(ratings!["kobbie mainoo"]).toBe(6.9);
    expect(ratings!["lionel messi"]).toBe(9.1);
  });

  it("returns null when lineup is missing", () => {
    expect(extractRatings({})).toBeNull();
    expect(extractRatings({ matchFacts: {} })).toBeNull();
  });

  it("skips players with no rating", () => {
    const content = {
      lineup: {
        homeTeam: { starters: [{ id: 1, name: "No Rating Player" }], subs: [] },
        awayTeam: { starters: [], subs: [] },
      },
    };
    const ratings = extractRatings(content);
    expect(ratings).not.toBeNull();
    expect(Object.keys(ratings!)).toHaveLength(0);
  });
});

// ── extractMotm ───────────────────────────────────────────────────────────────

describe("extractMotm", () => {
  it("extracts MOTM name and team", () => {
    const motm = extractMotm(SAMPLE_CONTENT);
    expect(motm).not.toBeNull();
    expect(motm!.name).toBe("Bruno Fernandes");
    expect(motm!.teamName).toBe("England");
  });

  it("returns null when matchFacts is absent", () => {
    expect(extractMotm({})).toBeNull();
    expect(extractMotm({ matchFacts: {} })).toBeNull();
  });

  it("handles object-style name (firstName/lastName)", () => {
    const content = {
      matchFacts: {
        playerOfTheMatch: {
          name: { firstName: "Bruno", lastName: "Fernandes", fullName: "Bruno Fernandes" },
          teamName: "England",
        },
      },
    };
    const motm = extractMotm(content);
    expect(motm!.name).toBe("Bruno Fernandes");
  });
});

// ── extractFormation ──────────────────────────────────────────────────────────

describe("extractFormation", () => {
  it("extracts home and away formations", () => {
    const formation = extractFormation(SAMPLE_CONTENT);
    expect(formation).not.toBeNull();
    expect(formation!.home).toBe("4-3-3");
    expect(formation!.away).toBe("4-2-3-1");
  });

  it("returns null when lineup is absent", () => {
    expect(extractFormation({})).toBeNull();
  });

  it("returns null when neither formation is present", () => {
    const content = { lineup: { homeTeam: {}, awayTeam: {} } };
    expect(extractFormation(content)).toBeNull();
  });
});

// ── applyFotmobRatings ────────────────────────────────────────────────────────

describe("applyFotmobRatings", () => {
  it("overwrites rating by normalised name match", () => {
    const lineup = [
      { id: "p1", name: "Bruno Fernandes", shirtNumber: 8, position: "AM" as const, starter: true, minutesPlayed: 90, rating: 6.5 },
    ];
    const ratings = { "bruno fernandes": 8.5 };
    const result = applyFotmobRatings(lineup, ratings);
    expect(result[0].rating).toBe(8.5);
  });

  it("leaves rating unchanged when no FotMob entry exists", () => {
    const lineup = [
      { id: "p1", name: "Unknown Player", shirtNumber: 9, position: "ST" as const, starter: true, minutesPlayed: 90, rating: 7.0 },
    ];
    const result = applyFotmobRatings(lineup, { "bruno fernandes": 8.5 });
    expect(result[0].rating).toBe(7.0);
  });

  it("returns unchanged lineup for empty ratings map", () => {
    const lineup = [
      { id: "p1", name: "Bruno Fernandes", shirtNumber: 8, position: "AM" as const, starter: true, minutesPlayed: 90, rating: 6.5 },
    ];
    const result = applyFotmobRatings(lineup, {});
    expect(result[0].rating).toBe(6.5);
  });
});

describe("applyFotmobPositions layout coordinates", () => {
  it("attaches verticalLayout coords to matched starters, leaves unmatched untouched", () => {
    const espn = [
      { id: "a", name: "Matheus Cunha", shirtNumber: 9, position: "FW" as const, starter: true, minutesPlayed: 90 },
      { id: "b", name: "Alisson", shirtNumber: 1, position: "GK" as const, starter: true, minutesPlayed: 90 }, // phantom — not in FotMob
    ];
    const fotmobLineup = {
      starters: [
        { id: 1, name: "Matheus Cunha", positionId: 115, verticalLayout: { x: 0.5, y: 0.87 } },
      ],
      subs: [],
    };
    const result = applyFotmobPositions(espn, fotmobLineup, "4-2-3-1");
    const cunha = result.find((p) => p.id === "a")!;
    const phantom = result.find((p) => p.id === "b")!;
    expect(cunha.layout).toEqual({ x: 0.5, y: 0.87 });
    expect(phantom.layout).toBeUndefined();
  });
});
