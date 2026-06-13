import type { UnitedPlayer } from "@/types";

/**
 * Manchester United first-team squad (2025-26 season) and the national
 * teams they represent at the 2026 World Cup / friendlies.
 *
 * The list is intentionally easy to edit: drop or add a player here and they
 * appear / disappear from the app.  ESPN athlete ids are resolved at runtime
 * by matching the player name against the national team roster, so we don't
 * need to maintain them manually.
 *
 * `imageUrl` points to a locally-hosted copy under `public/players/` (downloaded
 * from Wikipedia Commons) so the dashboard never depends on Wikimedia at runtime
 * — their User-Agent policy rate-limits (429) bulk hotlinking. See
 * `public/players/ATTRIBUTION.md` for the source/licence of each photo.
 *
 * Source: https://en.wikipedia.org/wiki/2025%E2%80%9326_Manchester_United_F.C._season
 *   + navboxes on the Wikipedia articles for each new signing.
 */
export const UNITED_PLAYERS: UnitedPlayer[] = [
  // ---------------------- Goalkeepers -------------------------------------
  {
    id: "bayindir",
    name: "Altay Bayindir",
    shortName: "Bayindir",
    shirtNumber: 1,
    position: "GK",
    nation: { id: "tur", name: "Türkiye", code: "TUR", flag: "\u{1F1F9}\u{1F1F7}", color: "#E30A17" },
    imageUrl: "/players/bayindir.jpg",
  },
  {
    id: "lammens",
    name: "Senne Lammens",
    shortName: "Lammens",
    shirtNumber: 31,
    position: "GK",
    nation: { id: "bel", name: "Belgium", code: "BEL", flag: "\u{1F1E7}\u{1F1EA}", color: "#FAE042", secondaryColor: "#ED2939" },
    imageUrl: "/players/lammens.jpg",
  },

  // ---------------------- Defenders ---------------------------------------
  {
    id: "dalot",
    name: "Diogo Dalot",
    shortName: "Dalot",
    shirtNumber: 2,
    position: "RB",
    nation: { id: "por", name: "Portugal", code: "POR", flag: "\u{1F1F5}\u{1F1F9}", color: "#046A38" },
    imageUrl: "/players/dalot.jpg",
  },
  {
    id: "mazraoui",
    name: "Noussair Mazraoui",
    shortName: "Mazraoui",
    shirtNumber: 3,
    position: "RB",
    nation: { id: "mar", name: "Morocco", code: "MAR", flag: "\u{1F1F2}\u{1F1E6}", color: "#C1272D" },
    imageUrl: "/players/mazraoui.jpg",
  },
  {
    id: "martinez",
    name: "Lisandro Martinez",
    shortName: "Licha",
    shirtNumber: 6,
    position: "CB",
    nation: { id: "arg", name: "Argentina", code: "ARG", flag: "\u{1F1E6}\u{1F1F7}", color: "#74ACDF" },
    imageUrl: "/players/martinez.jpg",
  },
  {
    id: "rashford",
    name: "Marcus Rashford",
    shortName: "Rashford",
    shirtNumber: 14,
    position: "LW",
    nation: { id: "eng", name: "England", code: "ENG", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", color: "#FFFFFF", secondaryColor: "#CF142B" },
    loaned: "FC Barcelona",
    imageUrl: "/players/rashford.jpg",
  },

  // ---------------------- Midfielders -------------------------------------
  {
    id: "bruno",
    name: "Bruno Fernandes",
    shortName: "Bruno Fernandes",
    shirtNumber: 8,
    position: "AM",
    nation: { id: "por", name: "Portugal", code: "POR", flag: "\u{1F1F5}\u{1F1F9}", color: "#046A38" },
    imageUrl: "/players/bruno.jpg",
  },
  {
    id: "casemiro",
    name: "Casemiro",
    shortName: "Casemiro",
    shirtNumber: 18,
    position: "DM",
    nation: { id: "bra", name: "Brazil", code: "BRA", flag: "\u{1F1E7}\u{1F1F7}", color: "#009C3B" },
    imageUrl: "/players/casemiro.jpg",
  },
  {
    id: "ugarte",
    name: "Manuel Ugarte",
    shortName: "Ugarte",
    shirtNumber: 25,
    position: "DM",
    nation: { id: "uru", name: "Uruguay", code: "URU", flag: "\u{1F1FA}\u{1F1FE}", color: "#0038A8" },
    imageUrl: "/players/ugarte.jpg",
  },
  {
    id: "mainoo",
    name: "Kobbie Mainoo",
    shortName: "Mainoo",
    shirtNumber: 37,
    position: "CM",
    nation: { id: "eng", name: "England", code: "ENG", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", color: "#FFFFFF", secondaryColor: "#CF142B" },
    imageUrl: "/players/mainoo.png",
  },
  {
    id: "fletcher",
    name: "Tyler Fletcher",
    shortName: "Tyler Fletcher",
    shirtNumber: 74,
    position: "CM",
    nation: { id: "sco", name: "Scotland", code: "SCO", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}", color: "#1A5490", secondaryColor: "#FFFFFF" },
    imageUrl: "/players/fletcher.png",
  },

  // ---------------------- Forwards ----------------------------------------
  {
    id: "cunha",
    name: "Matheus Cunha",
    shortName: "Matheus Cunha",
    shirtNumber: 10,
    position: "FW",
    nation: { id: "bra", name: "Brazil", code: "BRA", flag: "\u{1F1E7}\u{1F1F7}", color: "#009C3B" },
    imageUrl: "/players/cunha.jpg",
  },
  {
    id: "amad",
    name: "Amad Diallo",
    shortName: "Amad Diallo",
    shirtNumber: 16,
    position: "RW",
    nation: { id: "civ", name: "C\u00f4te d\u2019Ivoire", code: "CIV", flag: "\u{1F1E8}\u{1F1EE}", color: "#F77F00" },
    imageUrl: "/players/amad.jpg",
  },
];

/** Quick lookup helpers. */
export const PLAYERS_BY_ID: Record<string, UnitedPlayer> = Object.fromEntries(
  UNITED_PLAYERS.map((p) => [p.id, p])
);

export function getPlayerById(id: string): UnitedPlayer | undefined {
  return PLAYERS_BY_ID[id];
}

/** A normalised key for matching a name coming from external feeds. */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_ALIASES: Record<string, string> = {
  "lisandro martinez": "martinez",
  "matthijs de ligt": "deligt",
  "luke shaw": "shaw",
  "harry maguire": "maguire",
  "bruno fernandes": "bruno",
  "bruno miguel borges fernandes": "bruno",
  "mason mount": "mount",
  "lucas dorgu": "dorgu",
  "patrick dorgu": "dorgu",
  "patrik dorgu": "dorgu",
  "noussair mazraoui": "mazraoui",
  "manuel ugarte": "ugarte",
  "manuel ugarte ribeiro": "ugarte",
  "joshua zirkzee": "zirkzee",
  "joshua meek zirkzee": "zirkzee",
  "altay bayindir": "bayindir",
  "tom heaton": "heaton",
  "leny yoro": "yoro",
  "leny nuno yoro": "yoro",
  "ayden heaven": "heaven",
  "diogo dalot": "dalot",
  "amad diallo": "amad",
  "amad traore": "amad",
  "amad diallo traore": "amad",
  "amad": "amad",
  "tyrell malacia": "malacia",
  "bryan mbeumo": "mbeumo",
  "bryan tetsadong marceau mbeumo": "mbeumo",
  "matheus cunha": "cunha",
  "matheus santos carneiro da cunha": "cunha",
  "matheus santos carneiro cunha": "cunha",
  "benjamin sesko": "sesko",
  "senne lammens": "lammens",
  "diego leon": "leon",
  "diego basilio leon blanco": "leon",
};

/**
 * Try to match a name from an external feed (ESPN / API-Football) to one of
 * our UnitedPlayer records.  Returns undefined if no match is found.
 */
export function matchUnitedPlayer(name: string): UnitedPlayer | undefined {
  const key = normaliseName(name);
  if (NAME_ALIASES[key]) {
    return PLAYERS_BY_ID[NAME_ALIASES[key]];
  }
  const parts = key.split(" ");
  const tokenMatches: Array<{ player: UnitedPlayer; score: number }> = [];

  for (const player of UNITED_PLAYERS) {
    const playerFullName = normaliseName(player.name);
    const playerShortName = normaliseName(player.shortName);
    const playerTokens = new Set(playerFullName.split(" ").filter(Boolean));

    // 1. Exact full name match
    if (key === playerFullName) return player;

    // 2. Exact short name match (or feed name is exactly the player's short name)
    if (key === playerShortName) return player;

    // 3. Feed name includes full name
    if (key.includes(playerFullName)) return player;

    // 4. Fall back to last-name/short-name match when the feed name is detailed (has first + last)
    if (parts.length >= 2 && key.includes(playerShortName)) return player;

    const overlap = parts.filter((part) => playerTokens.has(part)).length;
    if (overlap >= 2) {
      tokenMatches.push({ player, score: overlap });
    }
  }

  tokenMatches.sort((a, b) => b.score - a.score);
  if (tokenMatches.length > 0) return tokenMatches[0].player;

  return undefined;
}

/** Distinct set of national teams that the United squad represents. */
export const NATIONAL_TEAMS = Array.from(
  new Map(UNITED_PLAYERS.map((p) => [p.nation.id, p.nation])).values()
).sort((a, b) => a.name.localeCompare(b.name));

export type NationalTeam = UnitedPlayer["nation"];

const NATION_BY_CODE = new Map(NATIONAL_TEAMS.map((t) => [t.code, t]));

/**
 * ESPN's team `abbreviation` is the primary key we match nations on, but it can
 * drift (e.g. a feed using "TUR" vs "TRY", or "CIV" vs "IVC").  Map the
 * normalised team *names* ESPN is likely to use back to our 3-letter codes so a
 * single abbreviation change can't make a whole nation's fixtures vanish.
 */
const NATION_NAME_TO_CODE: Record<string, string> = {
  turkiye: "TUR",
  turkey: "TUR",
  belgium: "BEL",
  portugal: "POR",
  morocco: "MAR",
  argentina: "ARG",
  brazil: "BRA",
  uruguay: "URU",
  england: "ENG",
  scotland: "SCO",
  "cote divoire": "CIV",
  "cote d ivoire": "CIV",
  "ivory coast": "CIV",
};

/**
 * Resolve a match team to one of our national teams, by ESPN abbreviation
 * first and by (normalised) name as a fallback.  When the name fallback rescues
 * a team whose code didn't match, we log it — that's a signal an ESPN code has
 * drifted and the hardcoded `code` may need updating.
 */
export function findNationForTeam(team: { code?: string | null; name?: string | null }): NationalTeam | undefined {
  const code = String(team.code ?? "").toUpperCase();
  const byCode = NATION_BY_CODE.get(code);
  if (byCode) return byCode;

  const mappedCode = NATION_NAME_TO_CODE[normaliseName(team.name ?? "")];
  if (mappedCode) {
    const byName = NATION_BY_CODE.get(mappedCode);
    if (byName) {
      console.warn(
        `players: nation matched by name fallback — ESPN code "${code || "(none)"}" ` +
        `did not match expected "${mappedCode}" for team "${team.name ?? ""}". ` +
        `Consider updating NATIONAL_TEAMS if this persists.`
      );
      return byName;
    }
  }
  return undefined;
}

/** True if a match team is one of the nations our United players represent. */
export function isOurNationTeam(team: { code?: string | null; name?: string | null }): boolean {
  return Boolean(findNationForTeam(team));
}
