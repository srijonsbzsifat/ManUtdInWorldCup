import type { LineupPlayer, MatchEvent, MatchTeam, Match } from '@/types';
import { PitchView } from './PitchView';
import { cn, eventIcon } from '@/lib/utils';

interface MatchLineupProps {
    match: Match;
}

export function MatchLineup({ match }: MatchLineupProps) {
    const hasFormation = match.formation?.home || match.formation?.away;

    if (hasFormation) {
        return (
            <PitchView
                homeFormation={match.formation?.home || undefined}
                awayFormation={match.formation?.away || undefined}
                homeLineup={match.lineups?.home || []}
                awayLineup={match.lineups?.away || []}
                homeEvents={match.events}
                awayEvents={match.events}
                homeTeam={match.home}
                awayTeam={match.away}
            />
        );
    }

    // Fallback to traditional lineup view
    return (
        <div className="space-y-6">
            <TeamLineup
                team={match.home}
                players={match.lineups?.home || []}
                events={match.events}
                orientation="home"
            />
            <TeamLineup
                team={match.away}
                players={match.lineups?.away || []}
                events={match.events}
                orientation="away"
            />
        </div>
    );
}

interface TeamLineupProps {
    team: MatchTeam;
    players: LineupPlayer[];
    events: MatchEvent[];
    orientation: "home" | "away";
}

function TeamLineup({ team, players, events, orientation }: TeamLineupProps) {
    const starters = players.filter(p => p.starter);
    const subs = players.filter(p => !p.starter);

    // Group events by player
    const playerEvents: Record<string, MatchEvent[]> = {};
    events.forEach(event => {
        if (event.player?.id) {
            if (!playerEvents[event.player.id]) {
                playerEvents[event.player.id] = [];
            }
            playerEvents[event.player.id].push(event);
        }
    });

    const getSubstitutionMarkers = (playerId: string): string | undefined => {
        const player = players.find(p => p.id === playerId);
        if (!player) return undefined;

        const markers = [];
        if (player.subOnMinute != null) {
            markers.push(`⬆ ${player.subOnMinute}'`);
        }
        if (player.subOffMinute != null) {
            markers.push(`⬇ ${player.subOffMinute}'`);
        }
        return markers.length > 0 ? markers.join(' ') : undefined;
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <div className="text-sm font-bold">
                    {team.name} {team.code ? `(${team.code})` : ''}
                </div>
            </div>

            <div className={cn(
                "bg-gray-50 rounded-lg p-3 border",
                orientation === "home" ? "border-team-home" : "border-team-away"
            )}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-1">Starting XI</h4>
                        <div className="space-y-1">
                            {starters.map(player => (
                                <PlayerLine
                                    key={player.id}
                                    player={player}
                                    events={playerEvents[player.id] || []}
                                />
                            ))}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-1">Substitutes</h4>
                        <div className="space-y-1">
                            {subs.length > 0 ? (
                                subs.map(player => (
                                    <PlayerLine
                                        key={player.id}
                                        player={player}
                                        events={playerEvents[player.id] || []}
                                        subMarker={getSubstitutionMarkers(player.id)}
                                    />
                                ))
                            ) : (
                                <span className="text-xs text-gray-400">No substitutes</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface PlayerLineProps {
    player: LineupPlayer;
    events: MatchEvent[];
    subMarker?: string;
}

function PlayerLine({ player, events, subMarker }: PlayerLineProps) {
    const getEventIcons = () => {
        return events.map((event, idx) => {
            const icon = eventIcon(event.type);
            return icon ? (
                <span key={idx} className="inline-block ml-1" title={`${event.type} ${event.minute}'`}>
                    {icon}
                </span>
            ) : null;
        }).filter(Boolean);
    };

    return (
        <div className="flex items-center text-sm">
            <div className="w-6 text-xs text-right mr-2">
                {player.shirtNumber}
            </div>
            <div className="flex-1 font-medium">
                {player.name}
                {player.motm && !player.starter && <span className="text-amber-400 ml-0.5 text-xs">★</span>}
                <span className="ml-1 text-xs text-gray-500">{player.position}</span>
            </div>
            <div className="flex items-center text-xs text-gray-500">
                {subMarker && <span className="mr-2">{subMarker}</span>}
                {getEventIcons()}
            </div>
        </div>
    );
}

