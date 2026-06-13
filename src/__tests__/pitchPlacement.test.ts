import { describe, it, expect } from "vitest";
import { computePlayerNodes, assignPlayersToFormation } from "@/lib/formation";
import type { LineupPlayer, PlayerPosition } from "@/types";

// Minimal LineupPlayer factory.
function p(
  id: string,
  name: string,
  position: PlayerPosition,
  opts: Partial<LineupPlayer> = {}
): LineupPlayer {
  return {
    id,
    name,
    shirtNumber: 0,
    position,
    starter: true,
    minutesPlayed: 90,
    ...opts,
  };
}

// Brazil's real XI from FotMob (event 5629007), verticalLayout coords.
// y: 0 = own goal → 1 = attack. x: 0 = team's right → 1 = left.
const BRAZIL_WITH_LAYOUT: LineupPlayer[] = [
  p("196876", "Alisson Becker", "GK", { layout: { x: 0.5, y: 0.1 } }),
  p("332354", "Wesley", "RB", { layout: { x: 0.125, y: 0.292 } }),
  p("258307", "Bremer", "CB", { layout: { x: 0.375, y: 0.292 } }),
  p("145405", "Léo Pereira", "CB", { layout: { x: 0.625, y: 0.292 } }),
  p("125514", "Alex Sandro", "LB", { layout: { x: 0.875, y: 0.292 } }),
  p("173666", "Casemiro", "DM", { layout: { x: 0.3, y: 0.485 } }),
  p("218522", "Bruno Guimarães", "CM", { layout: { x: 0.7, y: 0.485 } }),
  p("304215", "Luiz Henrique", "RW", { layout: { x: 0.162, y: 0.678 } }),
  p("231050", "Raphinha", "AM", { layout: { x: 0.5, y: 0.678 } }),
  p("252107", "Vinícius Júnior", "LW", { layout: { x: 0.837, y: 0.678 } }),
  p("259902", "Matheus Cunha", "ST", { layout: { x: 0.5, y: 0.87 } }),
];

// ESPN's data glitch: an extra starting keeper with a distinct id and no FotMob
// coordinates. This is what was pushing Cunha off the pitch.
const PHANTOM_GK = p("3095405", "Alisson", "GK");

describe("PitchView player placement", () => {
  it("places by FotMob coordinates and excludes a phantom extra keeper", () => {
    const starters = [...BRAZIL_WITH_LAYOUT, PHANTOM_GK];
    const nodes = computePlayerNodes(starters, "4-2-3-1", true);

    const ids = nodes.map((n) => n.player.id);
    // All 11 real starters placed; phantom (no coords) excluded.
    expect(nodes).toHaveLength(11);
    expect(ids).toContain("259902"); // Cunha is on the pitch
    expect(ids).not.toContain("3095405"); // phantom Alisson is not

    // Cunha (the striker) is the most advanced home player (largest x = depth).
    const maxX = Math.max(...nodes.map((n) => n.x));
    const cunha = nodes.find((n) => n.player.id === "259902")!;
    expect(cunha.x).toBe(maxX);

    // GK sits at the back (smallest x).
    const minX = Math.min(...nodes.map((n) => n.x));
    const gk = nodes.find((n) => n.player.id === "196876")!;
    expect(gk.x).toBe(minX);
  });

  it("keeps a coordless real player (name mismatch) on the pitch, drops only the phantom", () => {
    // Mirrors the real feed: ESPN "Bremer" has no FotMob coords (FotMob calls him
    // "Gleison Bremer"), and there is a phantom extra keeper. Both lack layout,
    // but only the phantom should be excluded.
    const bremer = p("258307", "Bremer", "DF"); // real defender, no layout
    const withCoords = BRAZIL_WITH_LAYOUT.filter((pl) => pl.id !== "258307");
    const starters = [...withCoords, bremer, PHANTOM_GK];

    const nodes = computePlayerNodes(starters, "4-2-3-1", true);
    const ids = nodes.map((n) => n.player.id);

    expect(nodes).toHaveLength(11);
    expect(ids).toContain("258307"); // Bremer placed via position approximation
    expect(ids).toContain("259902"); // Cunha placed
    expect(ids).not.toContain("3095405"); // phantom dropped
  });

  it("maps the lateral axis so the left back is above the right back", () => {
    const nodes = computePlayerNodes(BRAZIL_WITH_LAYOUT, "4-2-3-1", true);
    const lb = nodes.find((n) => n.player.id === "125514")!; // Alex Sandro, x=0.875 (left)
    const rb = nodes.find((n) => n.player.id === "332354")!; // Wesley, x=0.125 (right)
    // Left flank renders at the top (smaller y).
    expect(lb.y).toBeLessThan(rb.y);
  });

  it("falls back to the heuristic but still drops an extra keeper (no layout data)", () => {
    // No coordinates anywhere → heuristic path. Two GKs, ten outfielders.
    const noLayout = [
      ...BRAZIL_WITH_LAYOUT.map((pl) => ({ ...pl, layout: undefined })),
      PHANTOM_GK,
    ];
    const nodes = computePlayerNodes(noLayout, "4-2-3-1", true);
    const ids = nodes.map((n) => n.player.id);

    expect(nodes).toHaveLength(11);
    expect(ids).toContain("259902"); // Cunha not displaced by the phantom
    expect(ids).not.toContain("3095405");
    // Exactly one keeper on the pitch.
    expect(nodes.filter((n) => n.player.position === "GK")).toHaveLength(1);
  });

  it("assignPlayersToFormation excludes every extra keeper from the outfield", () => {
    const starters = [
      ...BRAZIL_WITH_LAYOUT.map((pl) => ({ ...pl, layout: undefined })),
      PHANTOM_GK,
    ];
    const assigned = assignPlayersToFormation(starters, "4-2-3-1");
    const placed = assigned.filter((x): x is LineupPlayer => x !== null);
    const gkCount = placed.filter((x) => x.position === "GK").length;
    expect(gkCount).toBe(1);
    expect(placed.map((x) => x.id)).toContain("259902");
  });
});
