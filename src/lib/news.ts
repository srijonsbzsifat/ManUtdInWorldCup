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

function extractTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i")
  );
  return match
    ? match[1]
        .trim()
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
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

export async function fetchNewsForAllPlayers(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(
    UNITED_PLAYERS.slice(0, 12).map(async (p) => {
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
    })
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
