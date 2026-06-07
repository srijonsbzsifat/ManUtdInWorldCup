import type { UnitedPlayer } from "@/types";
import { flagImageUrl } from "@/lib/flags";

/**
 * Manchester United first-team squad (2025-26 season) and the national
 * teams they represent at the 2026 World Cup / friendlies.
 *
 * The list is intentionally easy to edit: drop or add a player here and they
 * appear / disappear from the app.  ESPN athlete ids are resolved at runtime
 * by matching the player name against the national team roster, so we don't
 * need to maintain them manually.
 *
 * `imageUrl` is sourced from Wikipedia Commons (public, CORS-friendly).
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
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Altay_Bayindir_%28cropped%29.jpg/250px-Altay_Bayindir_%28cropped%29.jpg",
  },
  {
    id: "lammens",
    name: "Senne Lammens",
    shortName: "Lammens",
    shirtNumber: 31,
    position: "GK",
    nation: { id: "bel", name: "Belgium", code: "BEL", flag: "\u{1F1E7}\u{1F1EA}", color: "#FAE042", secondaryColor: "#ED2939" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Senne_Lammens_USMNT_v_Belgium_Mar_28_2026-98_%28cropped%29.jpg/250px-Senne_Lammens_USMNT_v_Belgium_Mar_28_2026-98_%28cropped%29.jpg",
  },

  // ---------------------- Defenders ---------------------------------------
  {
    id: "dalot",
    name: "Diogo Dalot",
    shortName: "Dalot",
    shirtNumber: 2,
    position: "RB",
    nation: { id: "por", name: "Portugal", code: "POR", flag: "\u{1F1F5}\u{1F1F9}", color: "#046A38" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Diogo_Dalot_USMNT_v_Portugal_Mar_31_2026-12.jpg/250px-Diogo_Dalot_USMNT_v_Portugal_Mar_31_2026-12.jpg",
  },
  {
    id: "mazraoui",
    name: "Noussair Mazraoui",
    shortName: "Mazraoui",
    shirtNumber: 3,
    position: "RB",
    nation: { id: "mar", name: "Morocco", code: "MAR", flag: "\u{1F1F2}\u{1F1E6}", color: "#C1272D" },
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Mazraoui.jpg/250px-Mazraoui.jpg",
  },
  {
    id: "martinez",
    name: "Lisandro Martinez",
    shortName: "Licha",
    shirtNumber: 6,
    position: "CB",
    nation: { id: "arg", name: "Argentina", code: "ARG", flag: "\u{1F1E6}\u{1F1F7}", color: "#74ACDF" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Lisandro_Martinez_2022.jpg/250px-Lisandro_Martinez_2022.jpg",
  },
  {
    id: "rashford",
    name: "Marcus Rashford",
    shortName: "Rashford",
    shirtNumber: 14,
    position: "LW",
    nation: { id: "eng", name: "England", code: "ENG", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", color: "#FFFFFF", secondaryColor: "#CF142B" },
    loaned: "FC Barcelona",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Marcus_Rashford_in_2023.jpg/250px-Marcus_Rashford_in_2023.jpg",
  },

  // ---------------------- Midfielders -------------------------------------
  {
    id: "bruno",
    name: "Bruno Fernandes",
    shortName: "Bruno Fernandes",
    shirtNumber: 8,
    position: "AM",
    nation: { id: "por", name: "Portugal", code: "POR", flag: "\u{1F1F5}\u{1F1F9}", color: "#046A38" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Bruno_Fernandes_USMNT_v_Portugal_Mar_31_2026-27_%28cropped%29.jpg/250px-Bruno_Fernandes_USMNT_v_Portugal_Mar_31_2026-27_%28cropped%29.jpg",
  },
  {
    id: "casemiro",
    name: "Casemiro",
    shortName: "Casemiro",
    shirtNumber: 18,
    position: "DM",
    nation: { id: "bra", name: "Brazil", code: "BRA", flag: "\u{1F1E7}\u{1F1F7}", color: "#009C3B" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Casemiro_Brazil_Austria_June_2018.jpg/250px-Casemiro_Brazil_Austria_June_2018.jpg",
  },
  {
    id: "ugarte",
    name: "Manuel Ugarte",
    shortName: "Ugarte",
    shirtNumber: 25,
    position: "DM",
    nation: { id: "uru", name: "Uruguay", code: "URU", flag: "\u{1F1FA}\u{1F1FE}", color: "#0038A8" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/M.UGARTE.jpg/250px-M.UGARTE.jpg",
  },
  {
    id: "mainoo",
    name: "Kobbie Mainoo",
    shortName: "Mainoo",
    shirtNumber: 37,
    position: "CM",
    nation: { id: "eng", name: "England", code: "ENG", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", color: "#FFFFFF", secondaryColor: "#CF142B" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Manchester_United_wins_the_FA_Youth_Cup_2022.png/250px-Manchester_United_wins_the_FA_Youth_Cup_2022.png",
  },
  {
    id: "fletcher",
    name: "Tyler Fletcher",
    shortName: "Tyler Fletcher",
    shirtNumber: 74,
    position: "CM",
    nation: { id: "sco", name: "Scotland", code: "SCO", flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}", color: "#1A5490", secondaryColor: "#FFFFFF" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Manchester_United_wins_the_FA_Youth_Cup_2022.png/250px-Manchester_United_wins_the_FA_Youth_Cup_2022.png",
  },

  // ---------------------- Forwards ----------------------------------------
  {
    id: "cunha",
    name: "Matheus Cunha",
    shortName: "Matheus Cunha",
    shirtNumber: 10,
    position: "FW",
    nation: { id: "bra", name: "Brazil", code: "BRA", flag: "\u{1F1E7}\u{1F1F7}", color: "#009C3B" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Matheus_Cunha_%28cropped%29_20180920_Fussball%2C_UEFA_Europa_League%2C_RB_Leipzig_-_FC_Salzburg_by_Stepro_StP_7968_%28cropped%29.jpg/250px-Matheus_Cunha_%28cropped%29_20180920_Fussball%2C_UEFA_Europa_League%2C_RB_Leipzig_-_FC_Salzburg_by_Stepro_StP_7968_%28cropped%29.jpg",
  },
  {
    id: "amad",
    name: "Amad Diallo",
    shortName: "Amad Diallo",
    shirtNumber: 16,
    position: "RW",
    nation: { id: "civ", name: "C\u00f4te d\u2019Ivoire", code: "CIV", flag: "\u{1F1E8}\u{1F1EE}", color: "#F77F00" },
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Manchester_United_v_BSC_Young_Boys%2C_8_December_2021_%2817%29_%28cropped%29.jpg/250px-Manchester_United_v_BSC_Young_Boys%2C_8_December_2021_%2817%29_%28cropped%29.jpg",
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
  // Fall back to a last-name match.  We only use last-name matches when the
  // name from the feed has at least two tokens (first + last) - this prevents
  // a generic shortName like "Bruno" from matching every other "Bruno X".
  const parts = key.split(" ");
  for (const player of UNITED_PLAYERS) {
    if (key.includes(normaliseName(player.name))) return player;
    if (parts.length >= 2 && key.includes(normaliseName(player.shortName))) return player;
  }
  return undefined;
}

/** Distinct set of national teams that the United squad represents. */
export const NATIONAL_TEAMS = Array.from(
  new Map(UNITED_PLAYERS.map((p) => [p.nation.id, p.nation])).values()
).sort((a, b) => a.name.localeCompare(b.name));
