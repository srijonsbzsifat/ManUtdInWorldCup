// Generic fetch helpers used by the data source adapters.
// Centralising fetch makes it easy to add caching, retries, logging etc.

const DEFAULT_TIMEOUT_MS = 10_000;

export class FetchError extends Error {
  status: number;
  url: string;
  body?: string;
  silent: boolean;
  constructor(message: string, status: number, url: string, body?: string, silent = false) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.url = url;
    this.body = body;
    this.silent = silent;
  }
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit & {
    timeoutMs?: number;
    next?: { revalidate?: number };
    /** When true, 400/404 errors are not logged to the console. */
    silent4xx?: boolean;
  } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, next, silent4xx, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const cacheConfig = next ?? { revalidate: 60 };
    const res = await fetch(url, {
      ...rest,
      next: cacheConfig,
      headers: {
        Accept: "application/json",
        "User-Agent": "ManUtdWorldCup/1.0 (vercel)",
        ...(rest.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => undefined);
      const silent = silent4xx && (res.status === 400 || res.status === 404);
      throw new FetchError(
        `Request failed (${res.status}) for ${url}`,
        res.status,
        url,
        body,
        silent
      );
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

