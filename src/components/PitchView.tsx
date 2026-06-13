"use client";

import React, { useMemo, useState, useEffect } from 'react';
import type { LineupPlayer, MatchEvent, PlayerPosition, MatchTeam } from '@/types';
import { cn, ratingColor } from '@/lib/utils';
import { computePlayerNodes } from '@/lib/formation';

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

    const homeStarters = useMemo(() => {
        return homeLineup.filter(p => p.starter);
    }, [homeLineup]);

    const awayStarters = useMemo(() => {
        return awayLineup.filter(p => p.starter);
    }, [awayLineup]);

    const homeNodes = useMemo(() => computePlayerNodes(homeStarters, homeForm, true), [homeStarters, homeForm]);
    const awayNodes = useMemo(() => computePlayerNodes(awayStarters, awayForm, false), [awayStarters, awayForm]);

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
                    {homeNodes.map(({ player, x, y }) => {
                        const displayX = isVertical ? (50 - (y - 50) * 1.25) : x;
                        const displayY = isVertical ? (100 - remapXtoVerticalY(x)) : y;
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
                    {awayNodes.map(({ player, x, y }) => {
                        const displayX = isVertical ? (50 - (y - 50) * 1.25) : x;
                        const displayY = isVertical ? (100 - remapXtoVerticalY(x)) : y;
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
    const penaltySaves = player.penaltySaves ?? 0;
    const penaltyMisses = player.penaltyMisses ?? 0;
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

                {/* Ball events — bottom-right, stacked side by side, supports multiples.
                    Goals, own goals, missed penalties and penalty saves all live here. */}
                {(goals > 0 || ownGoals > 0 || penaltyMisses > 0 || penaltySaves > 0) && (
                    <div className="absolute -bottom-2 -right-2 flex items-center gap-0.5 z-20">
                        {Array.from({ length: Math.min(goals, 3) }).map((_, i) => (
                            <div key={`goal-${i}`} className="w-4 h-4 rounded-full bg-black/80 border border-white/10 flex items-center justify-center shadow-md" title={`${goals} goal(s)`}>
                                <span className="text-[12px] leading-none">⚽</span>
                            </div>
                        ))}
                        {Array.from({ length: Math.min(ownGoals, 3) }).map((_, i) => (
                            <div key={`og-${i}`} className="w-4 h-4 rounded-full bg-red-600 border border-white/10 flex items-center justify-center shadow-md" title={`${ownGoals} own goal(s)`}>
                                <span className="text-[12px] leading-none">⚽</span>
                            </div>
                        ))}
                        {Array.from({ length: Math.min(penaltyMisses, 3) }).map((_, i) => (
                            <div key={`pm-${i}`} className="relative w-4 h-4 rounded-full bg-black/80 border border-white/10 flex items-center justify-center shadow-md" title={`${penaltyMisses} penalty miss(es)`}>
                                <span className="text-[11px] leading-none opacity-90">⚽</span>
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 border border-black/40 flex items-center justify-center text-white text-[7px] font-extrabold leading-none">✕</span>
                            </div>
                        ))}
                        {Array.from({ length: Math.min(penaltySaves, 3) }).map((_, i) => (
                            <div key={`ps-${i}`} className="w-4 h-4 rounded-full bg-black/80 border border-white/10 flex items-center justify-center shadow-md" title={`${penaltySaves} penalty save(s)`}>
                                <span className="text-[10px] leading-none">🧤</span>
                            </div>
                        ))}
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
    const penaltySaves = player.penaltySaves ?? 0;
    const penaltyMisses = player.penaltyMisses ?? 0;

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
                {penaltyMisses > 0 && (
                    <div className="relative w-4 h-4 rounded-full bg-black/70 border border-white/10 flex items-center justify-center shadow" title={`${penaltyMisses} penalty miss(es)`}>
                        <span className="text-[9px] leading-none opacity-90">⚽</span>
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 border border-black/40 flex items-center justify-center text-white text-[6px] font-extrabold leading-none">✕</span>
                    </div>
                )}
                {penaltySaves > 0 && (
                    <div className="w-4 h-4 rounded-full bg-black/70 border border-white/10 flex items-center justify-center shadow" title={`${penaltySaves} penalty save(s)`}>
                        <span className="text-[9px] leading-none">🧤</span>
                    </div>
                )}
                {ownGoals > 0 && (
                    <div className="w-4 h-4 rounded-full bg-red-600 border border-white/10 flex items-center justify-center shadow" title="Own goal">
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