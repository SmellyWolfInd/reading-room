import { searchBurials, readBurial } from "./burials.server";
import { readNewspaperPage, searchNewspapers } from "./loc.server";
import type { BurialRecord, DeskQuery, DeskResult, NewspaperPage, SourceResult, WikiProfile } from "./types";
import { emptySource } from "./types";
import { explainError } from "./json";
import { readWiki, searchWiki } from "./wikitree.server";

const cache = new Map<string, { at: number; value: unknown }>();
const calls: number[] = [];

function gate(): void {
  const now = Date.now();
  while (calls.length && now - calls[0]! > 60_000) calls.shift();
  if (calls.length >= 40) {
    throw new Error("Too many searches in a minute. Wait and retry.");
  }
  calls.push(now);
}

function readCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at >= 120_000) return undefined;
  return hit.value as T;
}

function writeCache(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 40) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

async function settle<T>(
  work: Promise<SourceResult<T>>,
  ms: number,
  fallback: SourceResult<T>,
): Promise<SourceResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SourceResult<T>>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([
      work.catch((error: unknown) => emptySource<T>(fallback.openUrl, explainError(error))),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cacheable(result: DeskResult): boolean {
  return result.newspapers.ok && result.wikitree.ok && result.burials.ok;
}

export async function searchAll(query: DeskQuery): Promise<DeskResult> {
  const key = `search:${JSON.stringify(query)}`;
  const cached = readCache<DeskResult>(key);
  if (cached) return cached;
  gate();
  const [newspapers, wikitree, burials] = await Promise.all([
    settle(
      searchNewspapers(query),
      100_000,
      emptySource(
        "https://www.loc.gov/collections/chronicling-america/",
        "Library of Congress took too long after one retry. Other sources in this response are unaffected.",
      ),
    ),
    settle(
      searchWiki(query),
      20000,
      emptySource("https://www.wikitree.com/wiki/Special:SearchPerson", "WikiTree took too long. Retry once."),
    ),
    settle(
      searchBurials(query),
      20000,
      emptySource("https://www.findagrave.com/memorial/search", "Find a Grave took too long. Retry once."),
    ),
  ]);
  const value = { newspapers, wikitree, burials };
  if (cacheable(value)) writeCache(key, value);
  return value;
}

async function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = readCache<T>(key);
  if (cached) return cached;
  gate();
  const value = await load();
  writeCache(key, value);
  return value;
}

export async function readPaper(url: string, focus: string, maxChars: number): Promise<NewspaperPage> {
  return remember(`paper:${url}:${focus}:${maxChars}`, () => readNewspaperPage(url, focus, maxChars));
}

export async function readProfile(key: string): Promise<WikiProfile> {
  return remember(`wiki:${key}`, () => readWiki(key));
}

export async function readMemorial(id: string): Promise<BurialRecord> {
  return remember(`grave:${id}`, () => readBurial(id));
}