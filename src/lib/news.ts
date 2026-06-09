import { UNITED_PLAYERS } from "./players";

export interface NewsItem {
  playerId: string;
  playerName: string;
  shortName: string;
  nationName: string;
  nationCode: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

const HTML_AMP = String.fromCharCode(38) + "amp;";
const HTML_LT = String.fromCharCode(38) + "lt;";
const HTML_GT = String.fromCharCode(38) + "gt;";
const HTML_QUOT = String.fromCharCode(38) + "quot;";
const HTML_APOS = String.fromCharCode(38) + "#39;";
const AMP_RE = new RegExp(HTML_AMP, "g");
const LT_RE = new RegExp(HTML_LT, "g");
const GT_RE = new RegExp(HTML_GT, "g");
const QUOT_RE = new RegExp(HTML_QUOT, "g");
const APOS_RE = new RegExp(HTML_APOS, "g");

function extractTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i")
  );
  return match
    ? match[1]
      .trim()
      .replace(AMP_RE, "&")
      .replace(LT_RE, "<")
      .replace(GT_RE, ">")
      .replace(QUOT_RE, '"')
      .replace(APOS_RE, "'")
    : "";
}

function parseRssItems(
  xml: string
): { title: string; link: string; pubDate: string; source: string }[] {
  const items: {
    title: string;
    link: string;
    pubDate: string;
    source: string;
  }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, "title");
    const link = extractTag(content, "link");
    const pubDate = extractTag(content, "pubDate");
    const source =
      content.match(/<source[^>]*>([^<]*)<\/source>/)?.[1]?.trim() ?? "";
    if (title && link) {
      items.push({
        title,
        link,
        pubDate: pubDate || new Date().toUTCString(),
        source,
      });
    }
  }
  return items;
}

/**
 * Fetch news for a single player from Google News RSS.
 */
async function fetchNewsForPlayer(p: (typeof UNITED_PLAYERS)[number]): Promise<NewsItem[]> {
  const q = `"${p.name}" ${p.nation.name}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ManUtdWorldCup/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRssItems(xml);
    return items.slice(0, 3).map((item) => ({
      playerId: p.id,
      playerName: p.name,
      shortName: p.shortName || p.name.split(" ").pop()!,
      nationName: p.nation.name,
      nationCode: p.nation.code,
      title: item.title,
      link: item.link,
      source: item.source || "Google News",
      publishedAt: item.pubDate,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run async tasks with a concurrency limit.
 * Preserves Promise.allSettled behaviour - failures are collected, not thrown.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try {
        const value = await fn(items[i]);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function fetchNewsForAllPlayers(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  const seen = new Set<string>();

  const results = await runWithConcurrencyLimit(
    UNITED_PLAYERS,
    (p) => fetchNewsForPlayer(p),
    5 // max 5 concurrent Google News RSS requests
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        const dedup = item.title.toLowerCase().slice(0, 60);
        if (!seen.has(dedup)) {
          seen.add(dedup);
          all.push(item);
        }
      }
    }
  }

  all.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  return all;
}