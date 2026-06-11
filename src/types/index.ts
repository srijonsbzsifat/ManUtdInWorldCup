// Core domain types for the Manchester United @ World Cup app.

export type PlayerPosition =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "DM"
  | "CM"
  | "LM"
  | "RM"
  | "AM"
  | "LW"
  | "RW"
  | "CF"
  | "ST"
  | "MF"
  | "FW"
  | "DF";

export interface UnitedPlayer {
  id: string;            // our own slug
  name: string;
  shortName: string;
  shirtNumber: number;
  position: PlayerPosition;
  nation: {
    id: string;          // FIFA / ESPN team id
    name: string;
    shortName?: string;
    code: string;        // 3-letter FIFA code
    flag: string;        // unicode flag emoji
    /** URL to a flag image - used when the emoji font isn't available. */
    flagUrl?: string;
    color: string;       // primary color
    secondaryColor?: string;
  };
  /** ESPN athlete id (used to look up appearances). */
  espnId?: string;
  /** API-Football player id (used when API_FOOTBALL_KEY is set). */
  apiFootballId?: number;
  /** If the player is currently out on loan, the name of the loan club. */
  loaned?: string;
  imageUrl?: string;
  age?: number;
}

export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "SUSPENDED"
  | "CANCELED"
  | "AWARDED";

export type MatchMinute = number | string | null;

export interface MatchScore {
  home: number | null;
  away: number | null;
}

export interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
  code: string;
  flag: string;
  /** URL to a flag image - used when the emoji font isn't available. */
  flagUrl?: string;
  color: string;
  logoUrl?: string;
}

export interface LineupPlayer {
  id: string;
  name: string;
  shirtNumber: number;
  position: PlayerPosition;
  starter: boolean;
  /** Minute the player came on (only for subs). */
  subOnMinute?: number | null;
  /** Minute the player was subbed off (only for starters / subbed players). */
  subOffMinute?: number | null;
  /** Minutes played in the match. */
  minutesPlayed: number;
  rating?: number | null;
  captain?: boolean;
  /** Goals scored by this player in the match. */
  goals?: number;
  /** Assists provided by this player. */
  assists?: number;
  /** Yellow cards. */
  yellowCards?: number;
  /** Red cards (straight or second yellow). */
  redCards?: number;
  /** Own goals scored. */
  ownGoals?: number;
  /** Penalty saves (for goalkeepers). */
  penaltySaves?: number;
  /** Penalty misses. */
  penaltyMisses?: number;
  /** Conceded goals (for goalkeepers / defenders, to compute clean sheets). */
  goalsConceded?: number;
  /** Saves (GK). */
  saves?: number;
  /** Clean sheet boolean computed from goalsConceded. */
  cleanSheet?: boolean;
  /** Whether this player was named Man of the Match. */
  motm?: boolean;
  /** Whether this is a Man United player. */
  isUnitedPlayer?: boolean;
  /** Reference to our UnitedPlayer.id when applicable. */
  unitedPlayerId?: string;
}

export interface MatchEvent {
  id: string;
  minute: number;
  stoppage?: number;
  type:
  | "goal"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "var"
  | "penalty_missed"
  | "penalty_scored"
  | "penalty_saved"
  | "own_goal"
  | "kickoff"
  | "half_time"
  | "full_time"
  | "shot_on_target"
  | "shot_off_target"
  | "shot_saved"
  | "shot_blocked"
  | "shot_post"
  | "var_decision";
  team: "home" | "away";
  player?: { id?: string; name: string };
  assistPlayer?: { id?: string; name: string };
  detail?: string;
  scoreAfter?: { home: number; away: number };
}

export interface Match {
  id: string;
  competition: {
    id: string;
    name: string;
    emblem?: string;
  };
  kickoff: string;       // ISO timestamp
  status: MatchStatus;
  minute: MatchMinute;
  home: MatchTeam;
  away: MatchTeam;
  score: MatchScore;
  venue?: string;
  city?: string;
  /** Whether this is a World Cup / qualifier / friendly. */
  matchType: "world_cup" | "world_cup_qualifier" | "friendly" | "other";
  /** ESPN competition slug (e.g. "fifa.world", "fifa.friendly"). */
  espnSlug?: string;
  events: MatchEvent[];
  lineups?: {
    home: LineupPlayer[];
    away: LineupPlayer[];
  };
  /** Top-level team statistics if available. */
  statistics?: {
    home: Record<string, number>;
    away: Record<string, number>;
  };
  /** Player of the match. */
  motm?: { name: string; team: "home" | "away" };
  /** Friendly tournament / stage name. */
  stage?: string;
  /** Team formations if available (e.g., "4-3-3"). */
  formation?: { home: string | null; away: string | null };
}

export interface PlayerTournamentStats {
  playerId: string;
  matches: number;
  starts: number;
  subs: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  averageRating: number | null;
  ownGoals: number;
  bestRating: number | null;
  worstRating: number | null;
  motmCount: number;
  goalsPerMatch: number;
  minutesPerGoal: number | null;
  // Goalkeeper-specific: only meaningful for GK position but tracked for all.
  goalsConceded: number;
  saves: number;
}

export interface PlayerMatchPerformance {
  match: Match;
  player: LineupPlayer;
  opponent: MatchTeam;
  result: "W" | "D" | "L" | "TBD";
  score: string;        // e.g. "2-1"
  competition: string;
}

export interface DataSource {
  name: "espn" | "api-football" | "mock";
  available: boolean;
  reason?: string;
}
