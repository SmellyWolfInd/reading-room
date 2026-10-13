import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Landmark, ScrollText, Users } from "lucide-react";
import { readDeskBurial, readDeskPaper, readDeskProfile, searchDesk } from "@/lib/research/desk.functions";
import { BOT_INSTRUCTIONS, presentBurial, presentPaper, presentProfile, presentSearch } from "@/lib/research/present";
import type { DeskQuery, DeskResult } from "@/lib/research/types";

const EMPTY: DeskQuery = {
  given: "",
  surname: "",
  words: "",
  birthYear: "",
  deathYear: "",
  place: "",
  paperFrom: "",
  paperTo: "",
  page: 1,
  fuzzy: false,
};

const SAMPLES: { label: string; query: DeskQuery }[] = [
  {
    label: "Clara Bow",
    query: { ...EMPTY, given: "Clara", surname: "Bow", birthYear: "1905", deathYear: "1965" },
  },
  {
    label: "Samuel Clemens",
    query: { ...EMPTY, given: "Samuel", surname: "Clemens", birthYear: "1835", deathYear: "1910" },
  },
  {
    label: "Railroad accident",
    query: { ...EMPTY, words: "railroad accident", paperFrom: "1888", paperTo: "1892" },
  },
];

export function ReadingRoom() {
  const search = useServerFn(searchDesk);
  const readPaper = useServerFn(readDeskPaper);
  const readProfile = useServerFn(readDeskProfile);
  const readBurial = useServerFn(readDeskBurial);
  const [query, setQuery] = useState<DeskQuery>(SAMPLES[0]!.query);
  const [address, setAddress] = useState("/api/mcp");
  const [tools, setTools] = useState<string[]>([]);
  const [protocol, setProtocol] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeskResult | null>(null);
  const [packet, setPacket] = useState("");
  const [reading, setReading] = useState("");
  const [readingTitle, setReadingTitle] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setAddress(`${window.location.origin}/api/mcp`);
  }, []);

  const attachLine = `Add this MCP server: ${address}\nName it Reading Room. It is Remote HTTPS. It needs no token and no sign-in.`;

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
    } catch {
      setCopied("");
    }
  }

  async function run(next: DeskQuery) {
    setQuery(next);
    setBusy(true);
    setError("");
    setReading("");
    setReadingTitle("");
    try {
      const found = await search({ data: next });
      setResult(found);
      setPacket(presentSearch(found));
    } catch (caught) {
      setResult(null);
      setPacket("");
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkProtocol() {
    setProtocol("Checking…");
    try {
      const init = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "reading-room", version: "1.0.0" },
          },
        }),
      });
      const initBody = (await init.json()) as { result?: { protocolVersion?: string; serverInfo?: { name?: string } } };
      const list = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      });
      const listBody = (await list.json()) as { result?: { tools?: { name: string }[] } };
      const names = listBody.result?.tools?.map((tool) => tool.name) ?? [];
      setTools(names);
      setProtocol(
        `${initBody.result?.serverInfo?.name ?? "reading-room"} · ${initBody.result?.protocolVersion ?? "unknown"} · no login`,
      );
    } catch {
      setProtocol("The MCP endpoint did not answer.");
    }
  }

  function field(key: keyof DeskQuery, label: string, placeholder = "") {
    return (
      <label className="flex flex-col gap-1 text-sm text-quiet">
        {label}
        <input
          value={String(query[key])}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => setQuery({ ...query, [key]: event.target.value })}
          className="min-h-11 rounded-md border border-rule bg-sheet px-3 text-base text-ink"
        />
      </label>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="border-b border-rule pb-6">
        <p className="text-sm font-semibold tracking-wide text-moss uppercase">For a Grok bot</p>
        <h1 className="mt-2 font-display text-4xl text-balance text-ink">Reading Room</h1>
        <p className="mt-3 max-w-2xl text-lg text-quiet">
          A bot searches historic newspapers, public WikiTree profiles, and Find a Grave burials. Nobody signs in.
        </p>
      </header>

      <section className="grid gap-5 rounded-lg border border-rule bg-sheet p-4 sm:p-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Attach it to the bot</h2>
          <p className="mt-2 text-quiet">
            Publish first. A Grok bot can call only the published https address, and the path stays{" "}
            <span className="text-ink">/api/mcp</span>. Leave every token blank.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Paste this into the bot’s chat</h3>
          <pre className="mt-2 overflow-auto rounded-md bg-paper px-3 py-3 font-sans text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-ink">
            {attachLine}
          </pre>
          <p className="mt-2 text-sm text-quiet">
            On a team bot, the owner can instead open Setup, choose Plugins, add a custom MCP server, pick Remote
            HTTPS, and paste the address with no token.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Paste this into the bot’s instructions</h3>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-paper px-3 py-3 font-sans text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-ink">
            {BOT_INSTRUCTIONS}
          </pre>
        </div>
        <p className="text-sm text-quiet">
          Then ask: Look up Clara Bow, born 1905, died 1965. Read one newspaper page in full before you quote it.
        </p>
        <p className="break-all rounded-md bg-moss-soft px-3 py-3 font-sans text-sm text-ink">{address}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-md bg-moss px-4 text-sm font-semibold text-paper"
            onClick={() => void copyText("link", address)}
          >
            {copied === "link" ? "Copied" : "Copy the MCP link"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-rule bg-sheet px-4 text-sm font-semibold text-ink"
            onClick={() => void copyText("attach", attachLine)}
          >
            {copied === "attach" ? "Copied" : "Copy for the bot"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-rule bg-sheet px-4 text-sm font-semibold text-ink"
            onClick={() => void copyText("orders", BOT_INSTRUCTIONS)}
          >
            {copied === "orders" ? "Copied" : "Copy instructions"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-rule bg-sheet px-4 text-sm font-semibold text-ink"
            onClick={() => void checkProtocol()}
          >
            Check the endpoint
          </button>
        </div>
        {protocol ? <p className="text-sm text-quiet">{protocol}</p> : null}
        {tools.length ? (
          <ul className="flex flex-wrap gap-2">
            {tools.map((name) => (
              <li key={name} className="rounded-md bg-paper px-2 py-1 text-sm text-ink">
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Call the tools</h2>
        <p className="mt-1 text-sm text-quiet">Same search the bot runs. The packet underneath is the text it receives.</p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run({ ...query, page: 1 });
          }}
        >
          {field("given", "Given name", "Clara")}
          {field("surname", "Surname", "Bow")}
          {field("words", "Words in the page or memorial", "railroad accident")}
          {field("place", "Place or US state", "Missouri")}
          {field("birthYear", "Birth year", "1835")}
          {field("deathYear", "Death year", "1910")}
          {field("paperFrom", "Newspapers from", "1880")}
          {field("paperTo", "Newspapers to", "1910")}
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={query.fuzzy}
              onChange={(event) => setQuery({ ...query, fuzzy: event.target.checked })}
              className="size-4"
            />
            Allow similar spellings
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-md bg-moss px-4 text-sm font-semibold text-paper disabled:opacity-60"
            >
              {busy ? "Searching…" : "Search like the bot"}
            </button>
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                className="min-h-11 rounded-md border border-rule px-3 text-sm text-ink"
                onClick={() => void run(sample.query)}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-quiet">{error}</p> : null}
      </section>

      {result ? (
        <section className="flex flex-col gap-6">
          <SourceBlock
            icon={<ScrollText className="size-5" aria-hidden />}
            title="Library of Congress"
            note={result.newspapers.note}
            error={result.newspapers.error}
            total={result.newspapers.total}
            openUrl={result.newspapers.openUrl}
          >
            {result.newspapers.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-paper"
                  onClick={() => {
                    setReadingTitle(hit.title);
                    setReading("Reading the full page…");
                    void readPaper({
                      data: {
                        url: hit.url,
                        focus: [query.given, query.surname, query.words].filter(Boolean).join(" "),
                        maxChars: 8000,
                      },
                    })
                      .then((page) => setReading(presentPaper(page)))
                      .catch((caught: unknown) =>
                        setReading(caught instanceof Error ? caught.message : "Could not read the page."),
                      );
                  }}
                >
                  <span className="block font-semibold text-ink">{hit.newspaper || hit.title}</span>
                  <span className="block text-sm text-quiet">
                    {[hit.date, hit.page ? `page ${hit.page}` : "", hit.place].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 block text-sm text-ink">{hit.excerpt}</span>
                </button>
              </li>
            ))}
          </SourceBlock>
          <SourceBlock
            icon={<Users className="size-5" aria-hidden />}
            title="WikiTree"
            note={result.wikitree.note}
            error={result.wikitree.error}
            total={result.wikitree.total}
            openUrl={result.wikitree.openUrl}
          >
            {result.wikitree.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-paper"
                  onClick={() => {
                    setReadingTitle(hit.title);
                    setReading("Reading the profile…");
                    void readProfile({ data: { key: hit.name || hit.id } })
                      .then((profile) => setReading(presentProfile(profile)))
                      .catch((caught: unknown) =>
                        setReading(caught instanceof Error ? caught.message : "Could not read the profile."),
                      );
                  }}
                >
                  <span className="block font-semibold text-ink">
                    {hit.title} <span className="font-normal text-quiet">{hit.name}</span>
                  </span>
                  <span className="block text-sm text-quiet">
                    {[hit.birthDate && `born ${hit.birthDate}`, hit.deathDate && `died ${hit.deathDate}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </SourceBlock>
          <SourceBlock
            icon={<Landmark className="size-5" aria-hidden />}
            title="Find a Grave"
            note={result.burials.note}
            error={result.burials.error}
            total={result.burials.total}
            openUrl={result.burials.openUrl}
          >
            {result.burials.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-paper"
                  onClick={() => {
                    setReadingTitle(hit.title);
                    setReading("Reading the memorial…");
                    void readBurial({ data: { memorialId: hit.id } })
                      .then((record) => setReading(presentBurial(record)))
                      .catch((caught: unknown) =>
                        setReading(caught instanceof Error ? caught.message : "Could not read the memorial."),
                      );
                  }}
                >
                  <span className="block font-semibold text-ink">{hit.title}</span>
                  <span className="block text-sm text-quiet">
                    {[hit.cemetery, hit.place, hit.birth && `born ${hit.birth}`, hit.death && `died ${hit.death}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </SourceBlock>
          {result.newspapers.hits.length ? (
            <button
              type="button"
              className="min-h-11 self-start rounded-md border border-rule px-3 text-sm text-ink"
              onClick={() => void run({ ...query, page: query.page + 1 })}
            >
              Next newspaper page
            </button>
          ) : null}
          {reading ? (
            <article className="rounded-lg border border-rule bg-sheet p-4">
              <h3 className="flex items-center gap-2 font-display text-xl text-ink">
                <BookOpen className="size-5" aria-hidden />
                {readingTitle || "Full record"}
              </h3>
              <pre className="mt-3 max-h-[32rem] overflow-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {reading}
              </pre>
            </article>
          ) : null}
          <article className="rounded-lg border border-rule bg-sheet p-4">
            <h3 className="font-display text-xl text-ink">Text the bot receives</h3>
            <pre className="mt-3 max-h-96 overflow-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {packet}
            </pre>
          </article>
        </section>
      ) : null}
    </main>
  );
}

function SourceBlock({
  icon,
  title,
  note,
  error,
  total,
  openUrl,
  children,
}: {
  icon: ReactNode;
  title: string;
  note?: string;
  error?: string;
  total: number | null;
  openUrl: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-rule bg-sheet p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-xl text-ink">
          {icon}
          {title}
        </h3>
        <span className="text-sm text-quiet tabular-nums">{error ? "unavailable" : (total ?? "—")}</span>
      </div>
      {error ? <p className="mt-2 text-sm text-quiet">{error}</p> : null}
      {note && !error ? <p className="mt-2 text-sm text-quiet">{note}</p> : null}
      <ul className="mt-2 divide-y divide-rule">{children}</ul>
      <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-moss" href={openUrl}>
        Open this search
      </a>
    </section>
  );
}
