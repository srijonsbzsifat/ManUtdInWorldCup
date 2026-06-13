// Pure formation/placement logic for the pitch view. Kept free of JSX/React so
// it can be unit-tested directly and reused.

import type { LineupPlayer } from "@/types";

// Convert 4-2-3-1 etc into left-to-right horizontal coordinates.
// Home team (Left half): GK is at x=8, DEF at x=20, MID at x=32, FW at x=44.
// Away team (Right half): GK is at x=92, DEF at x=80, MID at x=68, FW at x=56.
// Y is vertical, from 10 to 90.
export const FORMATION_LAYOUTS: Record<string, number[]> = {
    "4-4-2": [4, 4, 2],
    "4-3-3": [4, 3, 3],
    "4-2-3-1": [4, 2, 3, 1],
    "4-5-1": [4, 5, 1],
    "4-1-4-1": [4, 1, 4, 1],
    "3-4-3": [3, 4, 3],
    "3-5-2": [3, 5, 2],
    "3-4-2-1": [3, 4, 2, 1],
    "3-4-1-2": [3, 4, 1, 2],
    "5-3-2": [5, 3, 2],
    "5-4-1": [5, 4, 1],
    "4-2-2-2": [4, 2, 2, 2],
    "4-3-2-1": [4, 3, 2, 1],
    "4-3-1-2": [4, 3, 1, 2],
    "4-4-1-1": [4, 4, 1, 1],
    "3-3-3-1": [3, 3, 3, 1],
};

export function categorizePosition(position: string): "GK" | "DEF" | "MID" | "FW" | "WF" {
    const pos = position.toUpperCase();
    if (pos === "GK") return "GK";
    if (["LB", "LCB", "CB", "RCB", "RB", "FB", "WB", "DF"].includes(pos)) return "DEF";
    if (["DM", "LCM", "CM", "RCM", "AM", "MF", "LM", "RM"].includes(pos)) return "MID";
    if (["LW", "RW"].includes(pos)) return "WF";
    return "FW";
}

/**
 * Left-to-right ordering within a single formation row.
 * Team's LEFT flank = top of horizontal pitch (small y) = small index.
 * Team's RIGHT flank = bottom (large y) = large index.
 * AM sits between LM and RM (center of an AM row).
 * ST sits between LW and RW (center of a forward row).
 */
function positionHorizontalOrder(position: string): number {
    const leftToRight = [
        "GK",
        "LB", "LWB", "LCB", "CB", "RCB", "RB", "RWB", "FB", "DF", "WB",
        "LM", "DM", "LCM", "CM", "AM", "RCM", "RM", "MF",
        "LW", "CF", "ST", "FW", "RW",
    ];
    const idx = leftToRight.indexOf(position.toUpperCase());
    return idx >= 0 ? idx : 99;
}

/**
 * Depth score for assigning players to the correct formation line.
 * Lower = closer to own goal (DEF), higher = closer to opponent's goal (FW).
 */
function positionDepthScore(position: string): number {
    const pos = position.toUpperCase();
    if (pos === "GK") return 0;
    if (["LB", "CB", "RB", "LCB", "RCB", "FB", "WB", "DF"].includes(pos)) return 10;
    if (pos === "DM") return 20;
    if (["CM", "LCM", "RCM"].includes(pos)) return 30;
    if (["LM", "RM", "MF"].includes(pos)) return 35;
    if (pos === "AM") return 40;
    if (["LW", "RW"].includes(pos)) return 45;
    if (["CF", "ST", "FW"].includes(pos)) return 50;
    return 35;
}

export function generateCoordinatesForFormation(formation: string, isHome: boolean): { x: number; y: number }[] {
    const layout = FORMATION_LAYOUTS[formation];
    if (!layout) {
        // Try to parse dynamically from a formation string like "4-2-3-1"
        const parts = formation.split("-").map(Number);
        if (parts.some(isNaN) || parts.length === 0) return [];
        const coords: { x: number; y: number }[] = [];
        coords.push({ x: 8, y: 50 });
        const lines = parts.length;
        const startX = 18;
        const endX = 45;
        const stepX = (endX - startX) / Math.max(lines, 1);
        parts.forEach((lineCount, lineIdx) => {
            const x = startX + lineIdx * stepX + stepX / 2;
            for (let i = 0; i < lineCount; i++) {
                const y = 10 + ((i + 1) * 80) / (lineCount + 1);
                coords.push({ x, y });
            }
        });
        if (isHome) return coords;
        // Away team attacks right-to-left: mirror x AND flip y so their right
        // flank (RB/RM/RW) appears at the top of the screen, matching FotMob.
        return coords.map((p) => ({ x: 100 - p.x, y: 100 - p.y }));
    }

    const coords: { x: number; y: number }[] = [];
    coords.push({ x: 8, y: 50 });
    const lines = layout.length;
    const startX = 18;
    const endX = 45;
    const stepX = (endX - startX) / Math.max(lines, 1);
    layout.forEach((lineCount, lineIdx) => {
        const x = startX + lineIdx * stepX + stepX / 2;
        for (let i = 0; i < lineCount; i++) {
            const y = 10 + ((i + 1) * 80) / (lineCount + 1);
            coords.push({ x, y });
        }
    });
    if (isHome) return coords;
    return coords.map((p) => ({ x: 100 - p.x, y: 100 - p.y }));
}

/**
 * Assign starters to formation slots.
 *
 * Strategy:
 *   1. Pull out the GK.
 *   2. Sort the remaining 10 outfield players by positionDepthScore so that
 *      defenders naturally go to the back line, DMs to the next line, etc.
 *      Stable sort preserves ESPN (team-sheet) order for ties.
 *   3. Feed the depth-sorted pool into formation lines one line at a time,
 *      taking exactly `lineCount` players per line.
 *   4. Within each line, sort by positionHorizontalOrder so that left-flank
 *      players end up at the top of the screen and right-flank at the bottom.
 */
export function assignPlayersToFormation(
    starters: LineupPlayer[],
    formation: string
): (LineupPlayer | null)[] {
    let layout = FORMATION_LAYOUTS[formation];
    if (!layout) {
        const parts = formation.split("-").map(Number);
        if (parts.some(isNaN) || parts.length === 0) return [];
        layout = parts;
    }

    if (starters.length === 0) return [];

    // A starting XI has exactly one keeper. ESPN occasionally lists a duplicate
    // GK-position starter (a data glitch); exclude every keeper from the outfield
    // pool so a phantom can't displace a real outfielder off the pitch.
    const gks = starters.filter((p) => categorizePosition(p.position) === "GK");
    const gk = gks[0] ?? null;
    const result: (LineupPlayer | null)[] = [gk];

    // Pre-fill slots
    for (const count of layout) {
        for (let i = 0; i < count; i++) result.push(null);
    }

    const used = new Set<string>();
    for (const k of gks) used.add(k.id);

    // Sort outfield players by depth (stable — ties keep ESPN order)
    const outfield = starters
        .filter((p) => !used.has(p.id))
        .sort((a, b) => positionDepthScore(a.position) - positionDepthScore(b.position));

    // Assign to formation lines in depth order, sorting laterally within each line
    let poolIdx = 0;
    for (let lineIdx = 0; lineIdx < layout.length; lineIdx++) {
        const count = layout[lineIdx];
        const offset = 1 + layout.slice(0, lineIdx).reduce((a, b) => a + b, 0);

        const linePlayers = outfield.slice(poolIdx, poolIdx + count);
        poolIdx += count;

        // Sort left-to-right within the line
        linePlayers.sort(
            (a, b) => positionHorizontalOrder(a.position) - positionHorizontalOrder(b.position)
        );

        for (let i = 0; i < linePlayers.length; i++) {
            result[offset + i] = linePlayers[i];
            used.add(linePlayers[i].id);
        }
    }

    // Overflow: any remaining unassigned players fill empty slots
    const overflow = starters.filter((p) => !used.has(p.id));
    let oIdx = 0;
    for (let i = 0; i < result.length && oIdx < overflow.length; i++) {
        if (result[i] === null) {
            result[i] = overflow[oIdx++];
        }
    }

    return result;
}

export interface PlacedPlayer { player: LineupPlayer; x: number; y: number }

/**
 * Approximate FotMob-space coordinates (x: 0 right → 1 left; y: 0 own goal → 1
 * attack) by position label, used for the occasional starter whose name didn't
 * match FotMob's lineup (e.g. ESPN "Bremer" vs FotMob "Gleison Bremer") so they
 * still appear on the pitch rather than being dropped.
 */
const APPROX_LAYOUT: Record<string, { x: number; y: number }> = {
    GK: { x: 0.5, y: 0.09 },
    CB: { x: 0.5, y: 0.29 }, DF: { x: 0.5, y: 0.29 }, LB: { x: 0.85, y: 0.29 }, RB: { x: 0.15, y: 0.29 },
    DM: { x: 0.5, y: 0.46 }, CM: { x: 0.5, y: 0.52 }, MF: { x: 0.5, y: 0.52 },
    LM: { x: 0.85, y: 0.6 }, RM: { x: 0.15, y: 0.6 }, AM: { x: 0.5, y: 0.66 },
    LW: { x: 0.85, y: 0.72 }, RW: { x: 0.15, y: 0.72 },
    CF: { x: 0.5, y: 0.86 }, ST: { x: 0.5, y: 0.86 }, FW: { x: 0.5, y: 0.86 },
};

function effectiveLayout(p: LineupPlayer): { x: number; y: number } {
    if (p.layout && Number.isFinite(p.layout.x) && Number.isFinite(p.layout.y)) return p.layout;
    return APPROX_LAYOUT[p.position.toUpperCase()] ?? { x: 0.5, y: 0.52 };
}

/**
 * A starting XI has exactly one keeper. ESPN occasionally lists a phantom extra
 * GK-position starter (a distinct athlete id, no FotMob coordinates); keep only
 * the first keeper so it can't inflate the pool and push a real outfielder off.
 */
function dropExtraKeepers(starters: LineupPlayer[]): LineupPlayer[] {
    let gkSeen = false;
    const out: LineupPlayer[] = [];
    for (const p of starters) {
        if (categorizePosition(p.position) === "GK") {
            if (gkSeen) continue;
            gkSeen = true;
        }
        out.push(p);
    }
    return out;
}

/**
 * Place starters using FotMob's exact pitch coordinates (`LineupPlayer.layout`),
 * the same data FotMob uses to draw its own formation map — far more reliable
 * than re-deriving slots from coarse labels. Coordless starters are approximated
 * from their position so none are dropped. Returns null when too few players
 * carry real coordinates, so the caller falls back to the label-based heuristic.
 */
function placeStartersByLayout(starters: LineupPlayer[], isHome: boolean): PlacedPlayer[] | null {
    const realCoords = starters.filter(
        (p) => p.layout && Number.isFinite(p.layout.x) && Number.isFinite(p.layout.y)
    ).length;
    // Need a majority of real coordinates to trust this path.
    if (realCoords < 7) return null;

    // Fixed mapping from FotMob's normalised axes to our pitch geometry.
    return starters.map((p) => {
        const L = effectiveLayout(p);
        const depth = 6 + L.y * 40;                  // own goal (~6) → halfway (~46)
        const lateral = 10 + (1 - L.x) * 80;         // x=1 (left) → top, x=0 (right) → bottom
        const x = isHome ? depth : 100 - depth;
        const y = isHome ? lateral : 100 - lateral;
        return { player: p, x, y };
    });
}

/** Fallback placement: zip formation slot coordinates with label-assigned players. */
function placeStartersByFormation(starters: LineupPlayer[], formation: string, isHome: boolean): PlacedPlayer[] {
    const positions = generateCoordinatesForFormation(formation, isHome);
    const assigned = assignPlayersToFormation(starters, formation);
    const nodes: PlacedPlayer[] = [];
    for (let i = 0; i < positions.length; i++) {
        const player = assigned[i];
        if (player) nodes.push({ player, x: positions[i].x, y: positions[i].y });
    }
    return nodes;
}

/** Coordinate-based placement when FotMob data allows, otherwise the heuristic. */
export function computePlayerNodes(starters: LineupPlayer[], formation: string, isHome: boolean): PlacedPlayer[] {
    const cleaned = dropExtraKeepers(starters);
    return placeStartersByLayout(cleaned, isHome) ?? placeStartersByFormation(cleaned, formation, isHome);
}
