"use client";

import React, { useMemo, useState, useEffect } from 'react';
import type { LineupPlayer, MatchEvent, PlayerPosition, MatchTeam } from '@/types';
import { cn, ratingColor } from '@/lib/utils';

interface PitchViewProps {
    homeFormation?: string;
    awayFormation?: string;
    homeLineup: LineupPlayer[];
    awayLineup: LineupPlayer[];
    homeEvents: MatchEvent[];
    awayEvents: MatchEvent[];
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
}

// Convert 4-2-3-1 etc into left-to-right horizontal coordinates.
// Home team (Left half): GK is at x=8, DEF at x=20, MID at x=32, FW at x=44.
// Away team (Right half): GK is at x=92, DEF at x=80, MID at x=68, FW at x=56.
// Y is vertical, from 10 to 90.
const FORMATION_LAYOUTS: Record<string, number[]> = {
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

function categorizePosition(position: string): "GK" | "DEF" | "MID" | "FW" | "WF" {
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
    if (["LB", "CB", "RB", "LCB", "RCB", "FB", "WB", "DF"].includes(pos)) return 10;
    if (pos === "DM") return 20;
    if (["CM", "LCM", "RCM"].includes(pos)) return 30;
    if (["LM", "RM", "MF"].includes(pos)) return 35;
    if (pos === "AM") return 40;
    if (["LW", "RW"].includes(pos)) return 45;
    if (["CF", "ST", "FW"].includes(pos)) return 50;
    return 35;
}

function generateCoordinatesForFormation(formation: string, isHome: boolean): { x: number; y: number }[] {
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
function assignPlayersToFormation(
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

    const gk = starters.find((p) => categorizePosition(p.position) === "GK") ?? null;
    const result: (LineupPlayer | null)[] = [gk];

    // Pre-fill slots
    for (const count of layout) {
        for (let i = 0; i < count; i++) result.push(null);
    }

    const used = new Set<string>();
    if (gk) used.add(gk.id);

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

/** Broad position label for the substitutes list. */
function getPositionLabel(pos: PlayerPosition): string {
    if (pos === 'GK') return 'Goalkeeper';
    if (['CB', 'LB', 'RB', 'DF'].includes(pos)) return 'Defender';
    if (['DM', 'CM', 'AM', 'MF', 'LM', 'RM'].includes(pos)) return 'Midfielder';
    return 'Attacker';
}

/**
 * Non-linear vertical remap for portrait pitch.
 * GK zones (x < 18 or x > 82) get a small slice; outfield zone gets the rest.
 * Returns displayY (0=top, 100=bottom) where home GK lands near bottom and away GK near top.
 */
function remapXtoVerticalY(x: number): number {
    if (x <= 18) {
        // Home GK zone: x ∈ [8,18] → displayY ∈ [92,88]
        return 92 - ((x - 8) / 10) * 4;
    } else if (x >= 82) {
        // Away GK zone: x ∈ [82,92] → displayY ∈ [12,8]
        return 12 - ((x - 82) / 10) * 4;
    } else {
        // Outfield zone: x ∈ [18,82] → displayY ∈ [88,12]
        return 88 - ((x - 18) / 64) * 76;
    }
}

export function PitchView({
    homeFormation,
    awayFormation,
    homeLineup = [],
    awayLineup = [],
    homeEvents = [],
    awayEvents = [],
    homeTeam,
    awayTeam,
}: PitchViewProps) {
    const homeForm = homeFormation || "4-3-3";
    const awayForm = awayFormation || "4-3-3";

    const homePositions = useMemo(() => generateCoordinatesForFormation(homeForm, true), [homeForm]);
    const awayPositions = useMemo(() => generateCoordinatesForFormation(awayForm, false), [awayForm]);

    const homeStarters = useMemo(() => {
        return homeLineup.filter(p => p.starter);
    }, [homeLineup]);

    const awayStarters = useMemo(() => {
        return awayLineup.filter(p => p.starter);
    }, [awayLineup]);

    const homeAssigned = useMemo(() => assignPlayersToFormation(homeStarters, homeForm), [homeStarters, homeForm]);
    const awayAssigned = useMemo(() => assignPlayersToFormation(awayStarters, awayForm), [awayStarters, awayForm]);

    // Split substitutes (who came on) vs Bench (who didn't play)
    const getSubsAndBench = (lineup: LineupPlayer[]) => {
        const subs = lineup.filter(p => !p.starter && (p.minutesPlayed ?? 0) > 0);
        const bench = lineup.filter(p => !p.starter && (p.minutesPlayed ?? 0) === 0);
        return { subs, bench };
    };

    const homeSubsInfo = useMemo(() => getSubsAndBench(homeLineup), [homeLineup]);
    const awaySubsInfo = useMemo(() => getSubsAndBench(awayLineup), [awayLineup]);

    const [isVertical, setIsVertical] = useState(false);
    useEffect(() => {
        const check = () => setIsVertical(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const homeRating = useMemo(() => {
        const ratings = homeLineup.filter(p => p.rating).map(p => p.rating as number);
        if (ratings.length === 0) return null;
        return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
    }, [homeLineup]);

    const awayRating = useMemo(() => {
        const ratings = awayLineup.filter(p => p.rating).map(p => p.rating as number);
        if (ratings.length === 0) return null;
        return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
    }, [awayLineup]);

    return (
        <div className="w-full bg-[#181818] text-white rounded-xl shadow-2xl p-4 sm:p-6 mb-8 border border-white/5">
            {/* Header section with overall team scores/formations */}
            <div className="flex justify-between items-center bg-[#202020] rounded-lg p-3 mb-4 border border-white/5">
                <div className="flex items-center gap-2">
                    {homeRating && (
                        <div className={cn("text-xs font-bold text-black px-1.5 rounded-full shadow-md", ratingColor(parseFloat(homeRating)))}>
                            {homeRating}
                        </div>
                    )}
                    <span className="font-bold text-sm sm:text-base">{homeTeam.name}</span>
                    <span className="text-xs text-white/50">({homeForm})</span>
                </div>
                <div className="text-xs text-white/40 font-semibold tracking-wider uppercase">Formation Map</div>
                <div className="flex items-center gap-2 text-right">
                    <span className="text-xs text-white/50">({awayForm})</span>
                    <span className="font-bold text-sm sm:text-base">{awayTeam.name}</span>
                    {awayRating && (
                        <div className={cn("text-xs font-bold text-black px-1.5 rounded-full shadow-md", ratingColor(parseFloat(awayRating)))}>
                            {awayRating}
                        </div>
                    )}
                </div>
            </div>

            {/* Pitch Visualisation — horizontal on desktop, vertical on mobile */}
            <div className="relative w-full overflow-hidden bg-[#1e2e24] rounded-lg border border-white/10" style={isVertical ? { height: '1200px' } : { aspectRatio: '3/2', minHeight: '320px' }}>
                {/* Grass stripes — vertical columns on desktop, horizontal rows on mobile */}
                <div className={cn("absolute inset-0", isVertical ? "flex flex-col" : "flex")}>
                    {Array.from({ length: 15 }).map((_, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "flex-1",
                                isVertical ? "w-full" : "h-full",
                                idx % 2 === 0 ? "bg-[#1f3a2b]" : "bg-[#183023]"
                            )}
                        />
                    ))}
                </div>

                {/* Pitch Markings */}
                {/* Center Circle & Dot — same for both orientations */}
                <div className="absolute top-1/2 left-1/2 w-28 h-28 border-2 border-white/20 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white/30 rounded-full transform -translate-x-1/2 -translate-y-1/2" />

                {isVertical ? (
                    <>
                        {/* Vertical mode: horizontal center line, top/bottom penalty areas */}
                        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/20 transform -translate-y-1/2" />
                        {/* Top penalty box (away) */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[10%] w-[60%] border-2 border-white/20 border-t-0 bg-transparent" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[3%] w-[25%] border-2 border-white/20 border-t-0 bg-transparent" />
                        {/* Top Penalty Arc */}
                        <div className="absolute left-1/2 w-20 h-20 border-2 border-white/20 rounded-full" style={{ top: '10%', transform: 'translate(-50%, -50%)', clipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)' }} />
                        {/* Bottom penalty box (home) */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[10%] w-[60%] border-2 border-white/20 border-b-0 bg-transparent" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3%] w-[25%] border-2 border-white/20 border-b-0 bg-transparent" />
                        {/* Bottom Penalty Arc */}
                        <div className="absolute left-1/2 w-20 h-20 border-2 border-white/20 rounded-full" style={{ bottom: '10%', transform: 'translate(-50%, 50%)', clipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)' }} />
                    </>
                ) : (
                    <>
                        {/* Horizontal mode: vertical center line, left/right penalty areas */}
                        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/20 transform -translate-x-1/2" />
                        {/* Left Penalty Area */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white/20 border-l-0 bg-transparent" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[5%] h-[25%] border-2 border-white/20 border-l-0 bg-transparent" />
                        {/* Left Penalty Arc */}
                        <div className="absolute top-1/2 w-20 h-20 border-2 border-white/20 rounded-full" style={{ left: '16%', transform: 'translate(-50%, -50%)', clipPath: 'polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)' }} />
                        {/* Right Penalty Area */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white/20 border-r-0 bg-transparent" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[5%] h-[25%] border-2 border-white/20 border-r-0 bg-transparent" />
                        {/* Right Penalty Arc */}
                        <div className="absolute top-1/2 w-20 h-20 border-2 border-white/20 rounded-full" style={{ right: '16%', transform: 'translate(50%, -50%)', clipPath: 'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)' }} />
                    </>
                )}

                {/* Players container */}
                <div className="absolute inset-0">
                    {/* Home Team */}
                    {homePositions.map((pos, idx) => {
                        const player = homeAssigned[idx];
                        if (!player) return null;
                        const displayX = isVertical ? (50 - (pos.y - 50) * 1.25) : pos.x;
                        const displayY = isVertical ? (100 - remapXtoVerticalY(pos.x)) : pos.y;
                        return (
                            <PlayerNode
                                key={`home-player-${player.id}`}
                                player={player}
                                x={displayX}
                                y={displayY}
                                color={homeTeam.color}
                            />
                        );
                    })}

                    {/* Away Team */}
                    {awayPositions.map((pos, idx) => {
                        const player = awayAssigned[idx];
                        if (!player) return null;
                        const displayX = isVertical ? (50 - (pos.y - 50) * 1.25) : pos.x;
                        const displayY = isVertical ? (100 - remapXtoVerticalY(pos.x)) : pos.y;
                        return (
                            <PlayerNode
                                key={`away-player-${player.id}`}
                                player={player}
                                x={displayX}
                                y={displayY}
                                color={awayTeam.color}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Substitutes & Bench Section */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">
                {/* Left Team (Home) Subs */}
                <div className="bg-[#1e1e1e] rounded-lg p-3 border border-white/5 space-y-3">
                    <div className="text-xs font-bold text-white/40 tracking-wider uppercase">{homeTeam.name} Subs</div>
                    <SubsList subsInfo={homeSubsInfo} />
                </div>

                {/* Right Team (Away) Subs */}
                <div className="bg-[#1e1e1e] rounded-lg p-3 border border-white/5 space-y-3">
                    <div className="text-xs font-bold text-white/40 tracking-wider uppercase">{awayTeam.name} Subs</div>
                    <SubsList subsInfo={awaySubsInfo} />
                </div>
            </div>
        </div>
    );
}

function PlayerNode({
    player,
    x,
    y,
    color,
}: {
    player: LineupPlayer;
    x: number;
    y: number;
    color: string;
}) {
    const rating = player.rating ? player.rating.toFixed(1) : null;
    const goals = player.goals ?? 0;
    const ownGoals = player.ownGoals ?? 0;
    const assists = player.assists ?? 0;
    const yellowCards = player.yellowCards ?? 0;
    const redCards = player.redCards ?? 0;
    const subOffMin = player.subOffMinute;

    return (
        <div
            className="absolute flex flex-col items-center z-10 select-none"
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
        >
            {/* Circle with all floating badges */}
            <div className="relative w-10 h-10">

                {/* Sub-off time — top-left: icon + minute side by side */}
                {subOffMin != null && (
                    <div className="absolute -top-4 -left-2 flex items-center gap-0.5 z-30 whitespace-nowrap">
                        <div className="w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center text-white text-[8px] font-bold leading-none">↔</div>
                        <span className="text-[9px] font-bold text-white/70">{subOffMin}&apos;</span>
                    </div>
                )}

                {/* Rating — top-right */}
                {rating && (
                    <div className={cn(
                        "absolute -top-3.5 -right-4 text-[10px] font-extrabold text-black px-1.5 py-0.5 rounded-full shadow-md border border-black/10 z-20 leading-none flex items-center gap-0.5",
                        ratingColor(player.rating!, player.motm)
                    )}>
                        {rating}
                        {player.motm && <span className="text-[7px]">★</span>}
                    </div>
                )}

                {/* Player circle */}
                <div
                    className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-lg transition-transform hover:scale-110",
                        player.isUnitedPlayer ? "bg-amber-400 border-amber-300" : "bg-white border-white/80"
                    )}
                    style={{ borderColor: player.isUnitedPlayer ? undefined : color }}
                >
                    <span className="text-black text-xs font-extrabold">{player.shirtNumber}</span>
                </div>

                {/* Yellow card — middle-left (actual card shape) */}
                {yellowCards > 0 && redCards === 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 w-2.5 h-3.5 bg-yellow-400 rounded-[2px] shadow-md z-20" />
                )}

                {/* Red card — middle-left; if 2nd yellow: stack yellow above red */}
                {redCards > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 z-20 flex flex-col gap-[2px]">
                        {yellowCards > 0 && (
                            <div className="w-2.5 h-2 bg-yellow-400 rounded-[2px] shadow" />
                        )}
                        <div className="w-2.5 h-3.5 bg-red-500 rounded-[2px] shadow" />
                    </div>
                )}

                {/* Assist — bottom-left: "A" badge */}
                {assists > 0 && (
                    <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] font-extrabold shadow z-20" title={`${assists} assist(s)`}>
                        A
                    </div>
                )}

                {/* Goal — bottom-right: ball in dark circle */}
                {goals > 0 && (
                    <div className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-black/80 border border-white/10 flex items-center justify-center shadow-md z-20" title={`${goals} goal(s)`}>
                        <span className="text-[12px] leading-none">⚽</span>
                    </div>
                )}
                {ownGoals > 0 && goals === 0 && (
                    <div className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-black/60 border border-white/10 flex items-center justify-center shadow-md z-20 opacity-60" title="Own goal">
                        <span className="text-[9px] leading-none">⚽</span>
                    </div>
                )}
            </div>

            {/* Name row — captain badge left of name */}
            <div className="flex items-center gap-0.5 mt-1 max-w-[90px]">
                {player.captain && (
                    <span className="flex-shrink-0 bg-amber-400 text-black text-[8px] font-extrabold px-1 py-0.5 rounded-sm leading-none">C</span>
                )}
                <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 shadow truncate text-center",
                    player.isUnitedPlayer ? "text-amber-300 font-extrabold" : "text-white/90"
                )}>
                    {player.name.split(' ').pop()}
                </span>
            </div>
        </div>
    );
}

function SubsList({
    subsInfo,
}: {
    subsInfo: { subs: LineupPlayer[]; bench: LineupPlayer[] };
}) {
    const { subs, bench } = subsInfo;

    return (
        <div className="space-y-3">
            {subs.length > 0 && (
                <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5 font-bold">Substitutes</div>
                    <div className="space-y-1">
                        {subs.map(player => (
                            <SubPlayerRow key={player.id} player={player} isPlayed={true} />
                        ))}
                    </div>
                </div>
            )}

            {bench.length > 0 && (
                <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5 font-bold">Unused</div>
                    <div className="space-y-1">
                        {bench.map(player => (
                            <SubPlayerRow key={player.id} player={player} isPlayed={false} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SubPlayerRow({
    player,
    isPlayed,
}: {
    player: LineupPlayer;
    isPlayed: boolean;
}) {
    const goals = player.goals ?? 0;
    const ownGoals = player.ownGoals ?? 0;
    const assists = player.assists ?? 0;
    const yellowCards = player.yellowCards ?? 0;
    const redCards = player.redCards ?? 0;

    return (
        <div className={cn(
            "flex items-center gap-2 text-xs py-2 px-2 rounded-lg border border-white/5 hover:bg-white/5 transition-colors",
            player.isUnitedPlayer && "border-amber-500/20 bg-amber-500/5"
        )}>
            {/* Rating badge — left */}
            <div className={cn(
                "flex-shrink-0 min-w-[30px] text-center text-[10px] font-extrabold text-black px-1.5 py-0.5 rounded-full leading-tight",
                player.rating ? ratingColor(player.rating, player.motm) : "bg-neutral-700 text-white/30"
            )}>
                {player.rating ? player.rating.toFixed(1) : '—'}
            </div>

            {/* Shirt number */}
            <span className="flex-shrink-0 w-5 text-center text-[10px] text-white/40 font-bold">{player.shirtNumber}</span>

            {/* Name + position */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                    {player.captain && (
                        <span className="flex-shrink-0 bg-amber-400 text-black text-[7px] font-extrabold px-1 py-0.5 rounded-sm leading-none">C</span>
                    )}
                    <span className={cn(
                        "truncate font-semibold text-[11px]",
                        player.isUnitedPlayer ? "text-amber-300" : "text-white/90"
                    )}>
                        {player.name}
                        {player.motm && <span className="text-amber-400 ml-0.5">★</span>}
                    </span>
                </div>
                <div className="text-[10px] text-white/35 mt-0.5">{getPositionLabel(player.position)}</div>
            </div>

            {/* Event badges — goals, assists, cards */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {goals > 0 && Array.from({ length: Math.min(goals, 3) }).map((_, i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-black/70 border border-white/10 flex items-center justify-center shadow" title={`${goals} goal(s)`}>
                        <span className="text-[9px] leading-none">⚽</span>
                    </div>
                ))}
                {ownGoals > 0 && (
                    <div className="w-4 h-4 rounded-full bg-black/50 border border-white/10 flex items-center justify-center shadow opacity-60" title="Own goal">
                        <span className="text-[9px] leading-none">⚽</span>
                    </div>
                )}
                {assists > 0 && (
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] font-extrabold shadow" title={`${assists} assist(s)`}>
                        A
                    </div>
                )}
                {yellowCards > 0 && redCards === 0 && (
                    <div className="w-2.5 h-3.5 bg-yellow-400 rounded-[2px] shadow" title="Yellow card" />
                )}
                {redCards > 0 && (
                    <div className="flex flex-col gap-[2px]" title="Red card">
                        {yellowCards > 0 && <div className="w-2.5 h-2 bg-yellow-400 rounded-[2px]" />}
                        <div className="w-2.5 h-3.5 bg-red-500 rounded-[2px] shadow" />
                    </div>
                )}
            </div>

            {/* Sub-on time + green arrow */}
            {isPlayed ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                    {player.subOnMinute != null && (
                        <span className="text-[9px] text-white/50 font-bold">{player.subOnMinute}&apos;</span>
                    )}
                    <div className="w-5 h-5 rounded-full bg-emerald-900/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-[11px] font-bold">
                        →
                    </div>
                </div>
            ) : (
                /* Unused bench - show a subtle dash */
                <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 text-[10px]">
                    —
                </div>
            )}
        </div>
    );
}