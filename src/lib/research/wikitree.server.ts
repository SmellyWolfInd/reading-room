import type { DeskQuery, SourceResult, WikiHit, WikiProfile, WikiRelative } from "./types";
import { emptySource } from "./types";
import { browserFetch, directFetch, looksBlocked } from "./http.server";
import { asArray, asRecord, explainError, str } from "./json";
import { clip, htmlToText, wikiToText } from "./text";

const FIELDS =
  "Id,Name,FirstName,MiddleName,LastNameAtBirth,LastNameCurrent,BirthDate,DeathDate,BirthLocation,DeathLocation,Gender";

let wikiChain: Promise<unknown> = Promise.resolve();
let lastWikiCall = 0;

function wikiTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = wikiChain.then(async () => {
    const pause = 1800 - (Date.now() - lastWikiCall);
    if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      return await task();
    } finally {
      lastWikiCall = Date.now();
    }
  });
  wikiChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function wikiOnce(url: string): Promise<{ status: number; text: string }> {
  const direct = await directFetch(url).then(
    async (response) => ({ status: response.status, text: await response.text() }),
    (error: unknown) => ({ status: 0, text: explainError(error) }),
  );
  if (!looksBlocked(direct.status, direct.text) && /^[\[{]/.test(direct.text.trim())) return direct;
  const via = await browserFetch("wiki", url, { method: "GET" });
  return via ?? direct;
}

async function wikiFetch(url: string): Promise<unknown> {
  return wikiTurn(async () => {
    let payload = { status: 0, text: "" };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 3000));
      payload = await wikiOnce(url);
      if (!looksBlocked(payload.status, payload.text)) break;
    }
    if (looksBlocked(payload.status, payload.text)) {
      throw new Error("WikiTree blocked or rate-limited this server. Retry shortly. Do not invent a profile.");
    }
    try {
      return JSON.parse(payload.text) as unknown;
    } catch {
      throw new Error("WikiTree did not return JSON.");
    }
  });
}

function statusMessage(payload: unknown): string {
  const row = asRecord(Array.isArray(payload) ? payload[0] : payload);
  const status = row?.status;
  if (typeof status === "string" && status && status !== "0") return status;
  if (typeof status === "number" && status !== 0) return `WikiTree status ${status}.`;
  return "";
}

function profileUrl(name: string): string {
  return `https://www.wikitree.com/wiki/${encodeURIComponent(name)}`;
}

function openSearch(query: DeskQuery): string {
  const url = new URL("https://www.wikitree.com/wiki/Special:SearchPerson");
  if (query.given) url.searchParams.set("wpFirst", query.given);
  if (query.surname) url.searchParams.set("wpLast", query.surname);
  if (query.birthYear) url.searchParams.set("wpBirthDate", query.birthYear);
  if (query.deathYear) url.searchParams.set("wpDeathDate", query.deathYear);
  if (query.place) url.searchParams.set("wpBirthLocation", query.place);
  return url.toString();
}

export async function searchWiki(query: DeskQuery): Promise<SourceResult<WikiHit>> {
  const openUrl = openSearch(query);
  if (!query.given && !query.surname) {
    return emptySource(
      openUrl,
      "WikiTree needs a given name or surname. Words alone search newspapers and burials, not WikiTree.",
    );
  }
  try {
    const url = new URL("https://api.wikitree.com/api.php");
    url.searchParams.set("action", "searchPerson");
    if (query.given) url.searchParams.set("FirstName", query.given);
    if (query.surname) url.searchParams.set("LastName", query.surname);
    if (query.birthYear) url.searchParams.set("BirthDate", `${query.birthYear}-00-00`);
    if (query.deathYear) url.searchParams.set("DeathDate", `${query.deathYear}-00-00`);
    if (query.place) url.searchParams.set("BirthLocation", query.place);
    if (query.birthYear || query.deathYear) url.searchParams.set("dateSpread", "2");
    if (!query.fuzzy) url.searchParams.set("skipVariants", "1");
    url.searchParams.set("limit", "8");
    url.searchParams.set("fields", FIELDS);
    const payload = await wikiFetch(url.toString());
    const problem = statusMessage(payload);
    if (problem) return emptySource(openUrl, problem);
    const row = asRecord(Array.isArray(payload) ? payload[0] : payload);
    const total = typeof row?.total === "number" ? row.total : null;
    const hits: WikiHit[] = asArray(row?.matches).map((item) => {
      const person = asRecord(item) ?? {};
      const name = str(person.Name);
      const first = str(person.FirstName);
      const last = str(person.LastNameCurrent) || str(person.LastNameAtBirth);
      return {
        id: name || str(person.Id),
        name,
        url: name ? profileUrl(name) : openUrl,
        title: [first, last].filter(Boolean).join(" ") || name || "WikiTree profile",
        birthDate: str(person.BirthDate).replace(/-00/g, ""),
        deathDate: str(person.DeathDate).replace(/-00/g, ""),
        birthLocation: str(person.BirthLocation),
        deathLocation: str(person.DeathLocation),
        gender: str(person.Gender),
      };
    });
    return {
      ok: true,
      total,
      hits,
      openUrl,
      note: "Public WikiTree profiles only. Private profiles are not returned. Years match within 2 years when a year was given.",
    };
  } catch (error) {
    return emptySource(openUrl, explainError(error));
  }
}

function assertKey(key: string): string {
  const cleaned = key.trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(cleaned)) {
    throw new Error("WikiTree key must look like Clemens-1.");
  }
  return cleaned;
}

function collectRelatives(payload: unknown): WikiRelative[] {
  const found: WikiRelative[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, relation: string) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, relation));
      return;
    }
    const row = node as Record<string, unknown>;
    const rel = str(row.relation) || relation;
    const name = str(row.Name);
    if (name && /^[A-Za-z0-9-]+$/.test(name) && !seen.has(name)) {
      seen.add(name);
      const title = [str(row.FirstName), str(row.LastNameCurrent) || str(row.LastNameAtBirth)]
        .filter(Boolean)
        .join(" ");
      const dates = [str(row.BirthDate), str(row.DeathDate)].filter(Boolean).join(" – ");
      found.push({
        relation: rel || "relative",
        name: title || name,
        url: profileUrl(name),
        dates: dates.replace(/-00/g, ""),
      });
    }
    for (const [key, value] of Object.entries(row)) {
      if (value && typeof value === "object") walk(value, rel || key);
    }
  };
  walk(payload, "");
  return found.filter((item) => item.relation !== "profile").slice(0, 16);
}

function findBio(payload: unknown): string {
  let bio = "";
  const walk = (node: unknown) => {
    if (bio || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const row = node as Record<string, unknown>;
    for (const key of ["bio", "Bio", "biography"]) {
      if (typeof row[key] === "string" && row[key]) {
        bio = row[key] as string;
        return;
      }
    }
    Object.values(row).forEach(walk);
  };
  walk(payload);
  return clip(htmlToText(wikiToText(bio)), 8000).text;
}

export async function readWiki(key: string): Promise<WikiProfile> {
  const id = assertKey(key);
  const personUrl = new URL("https://api.wikitree.com/api.php");
  personUrl.searchParams.set("action", "getPerson");
  personUrl.searchParams.set("key", id);
  personUrl.searchParams.set("fields", FIELDS);
  const personPayload = await wikiFetch(personUrl.toString());
  const problem = statusMessage(personPayload);
  if (problem) throw new Error(problem);
  const wrapper = asRecord(Array.isArray(personPayload) ? personPayload[0] : personPayload);
  const person = asRecord(wrapper?.person) ?? wrapper ?? {};
  const name = str(person.Name) || id;

  const bioUrl = new URL("https://api.wikitree.com/api.php");
  bioUrl.searchParams.set("action", "getBio");
  bioUrl.searchParams.set("key", name);
  const bioPayload = await wikiFetch(bioUrl.toString()).catch(() => null);

  const relUrl = new URL("https://api.wikitree.com/api.php");
  relUrl.searchParams.set("action", "getRelatives");
  relUrl.searchParams.set("key", name);
  relUrl.searchParams.set("getParents", "1");
  relUrl.searchParams.set("getSpouses", "1");
  relUrl.searchParams.set("getChildren", "1");
  relUrl.searchParams.set("fields", FIELDS);
  const relPayload = await wikiFetch(relUrl.toString()).catch(() => null);

  return {
    name,
    title: [str(person.FirstName), str(person.LastNameCurrent) || str(person.LastNameAtBirth)]
      .filter(Boolean)
      .join(" ") || name,
    url: profileUrl(name),
    birthDate: str(person.BirthDate).replace(/-00/g, ""),
    deathDate: str(person.DeathDate).replace(/-00/g, ""),
    birthLocation: str(person.BirthLocation),
    deathLocation: str(person.DeathLocation),
    gender: str(person.Gender),
    bio: bioPayload ? findBio(bioPayload) : "",
    relatives: relPayload ? collectRelatives(relPayload).filter((item) => !item.url.endsWith(`/${name}`)) : [],
  };
}
