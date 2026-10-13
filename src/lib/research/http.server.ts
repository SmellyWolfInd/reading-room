const UA =
  "ReadingRoom/1.0 (public genealogy research; no account; Library of Congress, WikiTree, Find a Grave)";

export async function directFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", UA);
  if (!headers.has("accept")) headers.set("accept", "application/json, text/plain, */*");
  return fetch(url, {
    ...init,
    headers,
    redirect: init?.redirect ?? "follow",
    signal: init?.signal ?? AbortSignal.timeout(25000),
  });
}

export function looksBlocked(status: number, text: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 202 || status === 503) {
    return true;
  }
  const head = text.slice(0, 400).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("limit exceeded") ||
    head.includes("awswaf") ||
    head.includes("attention required") ||
    head.includes("cf-browser-verification")
  );
}

type BrowserKind = "wiki" | "grave";

type PageLike = {
  url: () => string;
  isClosed: () => boolean;
  title: () => Promise<string>;
  goto: (url: string, opts: { waitUntil: "commit"; timeout: number }) => Promise<unknown>;
  setDefaultTimeout: (ms: number) => void;
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: <T>(fn: (arg: { url: string; method: string; body?: string }) => Promise<T>, arg: {
    url: string;
    method: string;
    body?: string;
  }) => Promise<T>;
};

type BrowserLike = { close: () => Promise<void>; newContext: (opts: object) => Promise<ContextLike> };
type ContextLike = { newPage: () => Promise<PageLike> };

let browserPromise: Promise<BrowserLike | null> | null = null;
let contextPromise: Promise<ContextLike | null> | null = null;
const pages = new Map<BrowserKind, Promise<PageLike>>();
const queues = new Map<BrowserKind, Promise<unknown>>();

function enqueue<T>(kind: BrowserKind, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(kind) ?? Promise.resolve();
  const run = previous.then(task, task);
  queues.set(
    kind,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function loadBrowser(): Promise<BrowserLike | null> {
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const spec = "playwright";
        const mod = (await import(/* @vite-ignore */ spec)) as {
          chromium: { launch: (opts: object) => Promise<BrowserLike> };
        };
        return await mod.chromium.launch({
          headless: true,
          args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        });
      } catch {
        return null;
      }
    })();
  }
  return browserPromise;
}

async function getContext(): Promise<ContextLike | null> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const browser = await loadBrowser();
      if (!browser) return null;
      return browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "en-US",
      });
    })();
  }
  return contextPromise;
}

const START: Record<BrowserKind, string> = {
  wiki: "https://www.wikitree.com/wiki/Special:SearchPerson",
  grave: "https://www.findagrave.com/",
};

async function ensurePage(kind: BrowserKind): Promise<PageLike> {
  const current = pages.get(kind);
  if (current) {
    const page = await current;
    if (!page.isClosed()) return page;
    pages.delete(kind);
  }
  const pending = (async () => {
    const context = await getContext();
    if (!context) throw new Error("NO_BROWSER");
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(START[kind], { waitUntil: "commit", timeout: 35000 });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const title = await page.title();
      if (title && !/just a moment|attention required/i.test(title)) break;
      await page.waitForTimeout(800);
    }
    return page;
  })();
  pages.set(kind, pending);
  try {
    return await pending;
  } catch (error) {
    pages.delete(kind);
    throw error;
  }
}

export async function browserFetch(
  kind: BrowserKind,
  url: string,
  init?: { method?: string; body?: string },
): Promise<{ status: number; text: string } | null> {
  return enqueue(kind, async () => {
    try {
      const page = await ensurePage(kind);
      let last = { status: 0, text: "" };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        last = await page.evaluate(
          async (arg) => {
            const response = await fetch(arg.url, {
              method: arg.method,
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
              credentials: "include",
              body: arg.body,
            });
            const text = await response.text();
            return { status: response.status, text: text.slice(0, 180000) };
          },
          { url, method: init?.method ?? "GET", body: init?.body },
        );
        if (
          !looksBlocked(last.status, last.text) &&
          (last.text.startsWith("{") || last.text.startsWith("["))
        ) {
          return last;
        }
        await page.waitForTimeout(900);
      }
      return last.status ? last : null;
    } catch {
      pages.delete(kind);
      return null;
    }
  });
}

function assertAllowed(raw: string, allowedHosts: readonly string[]): void {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.includes(url.hostname)) {
    throw new Error("Refused an unexpected host.");
  }
}

export async function fetchText(
  url: string,
  accept = "application/json, text/plain, */*",
  timeoutMs = 25000,
  allowedHosts?: readonly string[],
): Promise<{
  status: number;
  text: string;
}> {
  let current = url;
  const deadline = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 4; hop += 1) {
    if (allowedHosts) assertAllowed(current, allowedHosts);
    const response = await directFetch(current, {
      headers: { accept },
      signal: deadline,
      redirect: allowedHosts ? "manual" : "follow",
    });
    if (allowedHosts && response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The source redirected without a destination.");
      current = new URL(location, current).toString();
      continue;
    }
    const text = (await response.text()).slice(0, 2_000_000);
    if (allowedHosts && response.url) assertAllowed(response.url, allowedHosts);
    return { status: response.status, text };
  }
  throw new Error("The source redirected too many times.");
}
