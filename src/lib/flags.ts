// Helpers for rendering country flags.
//
// The app stores a unicode flag emoji (`U+1F1E6`..`U+1F1FF`) for every nation,
// but the regional indicator symbols that compose a flag require an emoji font
// to render correctly.  When the user's system doesn't have one (or the emoji
// is too small to be useful) we fall back to a PNG served by flagcdn.com.
//
// Mapping the FIFA 3-letter codes we see in match data to the ISO 3166-1
// alpha-2 codes that flagcdn.com uses needs a small lookup table - some
// territories (England, Scotland, Northern Ireland, Wales) are not sovereign
// states and have to be handled specially.

// Comprehensive FIFA 3-letter code -> ISO 3166-1 (or flagcdn.com local code)
// mapping.  The first 2 letters of most FIFA codes match the ISO alpha-2
// code, but FIFA uses some special codes for non-sovereign nations (the UK
// "home nations" - England, Scotland, Wales, Northern Ireland - and a few
// territories) that need an explicit entry.
const FIFA_TO_ISO: Record<string, string> = {
  // Sovereign states
  AFG: "af", ALB: "al", ALG: "dz", AND: "ad", ANG: "ao", ARG: "ar", ARM: "am",
  AUS: "au", AUT: "at", AZE: "az", BAH: "bs", BRN: "bn", BAN: "bd", BAR: "bb",
  BLR: "by", BEL: "be", BLZ: "bz", BEN: "bj", BHU: "bt", BOL: "bo", BIH: "ba",
  BOT: "bw", BRA: "br", BRU: "bn", BUL: "bg", BFA: "bf", BDI: "bi", CAM: "kh",
  CMR: "cm", CAN: "ca", CPV: "cv", CTA: "cf", CHA: "td", CHI: "cl", CHN: "cn",
  COL: "co", COM: "km", CGO: "cg", COD: "cd", CRC: "cr", CRO: "hr", CUB: "cu",
  CYP: "cy", CZE: "cz", DEN: "dk", DJI: "dj", DOM: "do", ECU: "ec", EGY: "eg",
  SLV: "sv", EQG: "gq", ERI: "er", EST: "ee", ETH: "et", FIJ: "fj", FIN: "fi",
  FRA: "fr", GAB: "ga", GAM: "gm", GEO: "ge", GER: "de", GHA: "gh", GRE: "gr",
  GRN: "gd", GUA: "gt", GUI: "gn", GBS: "gw", GUY: "gy", HAI: "ht", HON: "hn",
  HUN: "hu", ISL: "is", IND: "in", IDN: "id", IRN: "ir", IRQ: "iq", IRL: "ie",
  ISR: "il", ITA: "it", CIV: "ci", JAM: "jm", JPN: "jp", JOR: "jo", KAZ: "kz",
  KEN: "ke", PRK: "kp", KOR: "kr", KUW: "kw", KGZ: "kg", LAO: "la", LAT: "lv",
  LBN: "lb", LES: "ls", LBR: "lr", LBY: "ly", LIE: "li", LTU: "lt", LUX: "lu",
  MAD: "mg", MWI: "mw", MAS: "my", MDV: "mv", MLI: "ml", MLT: "mt", MTN: "mr",
  MRI: "mu", MEX: "mx", MDA: "md", MON: "mc", MNG: "mn", MNE: "me", MAR: "ma",
  MOZ: "mz", MYA: "mm", NAM: "na", NEP: "np", NED: "nl", NZL: "nz", NCA: "ni",
  NIG: "ne", NGA: "ng", MKD: "mk", NOR: "no", OMA: "om", PAK: "pk", PAN: "pa",
  PAR: "py", PER: "pe", PHI: "ph", POL: "pl", POR: "pt", QAT: "qa", ROM: "ro",
  RUS: "ru", RWA: "rw", KSA: "sa", SEN: "sn", SRB: "rs", SLE: "sl", SGP: "sg",
  SVK: "sk", SVN: "si", SOL: "sb", SOM: "so", RSA: "za", ESP: "es", SRI: "lk",
  SDN: "sd", SUR: "sr", SWZ: "sz", SWE: "se", SUI: "ch", SYR: "sy", TPE: "tw",
  TJK: "tj", TAN: "tz", THA: "th", TOG: "tg", TRI: "tt", TUN: "tn", TUR: "tr",
  TKM: "tm", UGA: "ug", UKR: "ua", UAE: "ae", USA: "us", URU: "uy", UZB: "uz",
  VEN: "ve", VIE: "vn", YEM: "ye", ZAM: "zm", ZIM: "zw",
  // Special / non-ISO codes
  ANT: "bq",  // Netherlands Antilles
  AHO: "bq",  // alternate FIFA code for Netherlands Antilles
  CUW: "cw",  // Curaçao (cw, NOT cu which is Cuba)
  GIB: "gi",  // Gibraltar
  GUM: "gu",  // Guam
  NCL: "nc",  // New Caledonia
  NMI: "mp",  // Northern Mariana Islands
  PUR: "pr",  // Puerto Rico
  SAM: "ws",  // Samoa
  TAH: "pf",  // Tahiti
  // UK home nations (FIFA treats them as separate "nations")
  ENG: "gb-eng",
  NIR: "gb-nir",
  SCO: "gb-sct",
  WAL: "gb-wls",
};

/** Build a flagcdn.com URL for a FIFA 3-letter code.  Returns null if unknown. */
export function flagImageUrl(code: string | undefined | null, size: 40 | 80 | 160 | 320 = 80): string | null {
  if (!code) return null;
  const iso = FIFA_TO_ISO[code.toUpperCase()] ?? code.slice(0, 2).toLowerCase();
  return `https://flagcdn.com/w${size}/${iso}.png`;
}

/** Resolve a FIFA 3-letter code to the slug flagcdn.com uses. */
export function figmaFlagSlug(code: string | undefined | null): string | null {
  if (!code) return null;
  return FIFA_TO_ISO[code.toUpperCase()] ?? code.slice(0, 2).toLowerCase();
}

/**
 * Build a short label (max 3 chars) to use as a fallback when no flag image is
 * available.  Prefers the team's shortName, falling back to the 3-letter code.
 */
export function flagFallbackLabel(shortName: string | undefined, code: string | undefined): string {
  const src = (shortName || code || "?").trim();
  return src.slice(0, 3).toUpperCase();
}
