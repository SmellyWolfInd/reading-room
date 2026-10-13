import type { BurialHit, BurialRecord, DeskQuery, SourceResult } from "./types";
import { emptySource } from "./types";
import { browserFetch, directFetch, looksBlocked } from "./http.server";
import { asArray, asRecord, explainError, str } from "./json";
import { clip, htmlToText } from "./text";

const SEARCH_FIELDS = `
  id
  plot
  isVeteran
  hasGravePhoto
  gender
  name { first last maiden nickname given middle primary }
  birth { date { year month day circa } place { names { name } locations { city state country } } }
  death { date { year month day circa } place { names { name } locations { city state country } } }
  cemetery { id names { name } locations { city county state country } }
`;

const READ_FIELDS = `
  ${SEARCH_FIELDS}
  gravesiteDetails
  inscription { value }
  bio { value }
`;

type NameBits = {
  first?: string;
  last?: string;
  maiden?: string;
  nickname?: string;
  given?: string;
  middle?: string;
  primary?: boolean;
};

async function graveQuery(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ query, variables });
  const direct = await directFetch("https://www.findagrave.com/orc/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: "https://www.findagrave.com",
      referer: "https://www.findagrave.com/",
    },
    body,
  }).then(
    async (response) => ({ status: response.status, text: await response.text() }),
    (error: unknown) => ({ status: 0, text: explainError(error) }),
  );
  let payload = direct;
  if (looksBlocked(payload.status, payload.text) || !payload.text.trim().startsWith("{")) {
    const via = await browserFetch("grave", "https://www.findagrave.com/orc/graphql", {
      method: "POST",
      body,
    });
    if (via) payload = via;
  }
  if (!payload.text.trim().startsWith("{")) {
    throw new Error(
      "Find a Grave blocked this server. Use the openUrl and do not invent a burial.",
    );
  }
  const parsed = JSON.parse(payload.text) as { errors?: { message?: string }[]; data?: unknown };
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((error) => error.message).filter(Boolean).join("; ").slice(0, 400));
  }
  return parsed.data;
}

function eventText(event: unknown): { when: string; where: string } {
  const row = asRecord(event);
  const date = asRecord(row?.date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = typeof date?.year === "number" ? date.year : 0;
  const month = typeof date?.month === "number" ? months[(date.month as number) - 1] : "";
  const day = typeof date?.day === "number" && date.day ? String(date.day) : "";
  const whenCore = [day, month, year || ""].filter(Boolean).join(" ");
  const when = date?.circa === true && whenCore ? `about ${whenCore}` : whenCore;
  const place = asRecord(row?.place);
  const named = str(asRecord(asArray(place?.names)[0])?.name);
  const hier = asRecord(asArray(place?.locations)[0]);
  const whereBits = [str(hier?.city), str(hier?.state), str(hier?.country)].filter(Boolean);
  const where = [named, ...whereBits.filter((bit) => bit !== named)].filter(Boolean).join(", ");
  return { when, where };
}

function personTitle(value: unknown): { title: string; maiden: string } {
  const names = asArray(value).map((item) => (asRecord(item) ?? {}) as NameBits);
  const primary = names.find((name) => name.primary) ?? names[0];
  if (!primary) return { title: "Unknown", maiden: "" };
  const given = [primary.given || primary.first, primary.middle].filter(Boolean).join(" ");
  const nick = primary.nickname ? ` "${primary.nickname}"` : "";
  const last = primary.last || "";
  const maiden = primary.maiden && primary.maiden !== last ? primary.maiden : "";
  const title = `${given}${nick} ${last}${maiden ? ` (née ${maiden})` : ""}`.replace(/\s+/g, " ").trim();
  return { title: title || "Unknown", maiden };
}

function cemeteryText(value: unknown): { name: string; place: string } {
  const row = asRecord(value);
  const name = str(asRecord(asArray(row?.names)[0])?.name);
  const hier = asRecord(asArray(row?.locations)[0]);
  const place = [str(hier?.city), str(hier?.county), str(hier?.state), str(hier?.country)]
    .filter(Boolean)
    .join(", ");
  return { name, place };
}

function memorialUrl(id: string): string {
  return `https://www.findagrave.com/memorial/${encodeURIComponent(id)}`;
}

function openSearch(query: DeskQuery): string {
  const url = new URL("https://www.findagrave.com/memorial/search");
  if (query.given) url.searchParams.set("firstname", query.given);
  if (query.surname) url.searchParams.set("lastname", query.surname);
  if (query.birthYear) url.searchParams.set("birthyear", query.birthYear);
  if (query.deathYear) url.searchParams.set("deathyear", query.deathYear);
  return url.toString();
}

async function placeId(place: string): Promise<{ id: string; label: string } | null> {
  const data = await graveQuery(
    `query ($search: LocationSearchInput) {
      locationsByTypeahead(search: $search) {
        locations {
          ... on Location { id type names { name } locations { city state country } }
          ... on Cemetery { id names { name } locations { city state country } }
        }
      }
    }`,
    { search: { name: place, size: 5 } },
  );
  const locations = asArray(asRecord(asRecord(data)?.locationsByTypeahead)?.locations);
  const first = asRecord(locations[0]);
  const id = str(first?.id);
  if (!id) return null;
  const label = str(asRecord(asArray(first?.names)[0])?.name) || place;
  return { id, label };
}

function toHit(row: Record<string, unknown>): BurialHit {
  const id = str(row.id);
  const named = personTitle(row.name);
  const birth = eventText(row.birth);
  const death = eventText(row.death);
  const cemetery = cemeteryText(row.cemetery);
  return {
    id,
    title: named.title,
    url: id ? memorialUrl(id) : "https://www.findagrave.com/memorial/search",
    birth: [birth.when, birth.where].filter(Boolean).join(", "),
    death: [death.when, death.where].filter(Boolean).join(", "),
    cemetery: cemetery.name,
    place: cemetery.place,
    plot: str(row.plot),
    veteran: row.isVeteran === true,
    photo: row.hasGravePhoto === true,
  };
}

export async function searchBurials(query: DeskQuery): Promise<SourceResult<BurialHit>> {
  const openUrl = openSearch(query);
  if (!query.given && !query.surname && !query.words) {
    return emptySource(openUrl, "Add a name or words.");
  }
  try {
    let placeNote = "";
    let locationId = "";
    if (query.place) {
      try {
        const place = await placeId(query.place);
        if (place) {
          locationId = place.id;
          placeNote = `Place matched Find a Grave location “${place.label}”.`;
        } else {
          placeNote = "Place did not match a Find a Grave location, so it was not applied.";
        }
      } catch {
        placeNote = "Place lookup failed, so the burial search ignored it.";
      }
    }
    const search: Record<string, unknown> = {
      size: 8,
      includeMaidenName: true,
      fuzzyNames: query.fuzzy,
    };
    if (query.given) search.firstName = query.given;
    if (query.surname) search.lastName = query.surname;
    if (query.birthYear) search.birthYear = Number(query.birthYear);
    if (query.deathYear) search.deathYear = Number(query.deathYear);
    if (locationId) search.locationId = locationId;
    if (query.words) search.fullText = query.words;
    const data = await graveQuery(
      `query ($search: MemorialSearchInput) { memorialSearch(search: $search) { total memorials { ${SEARCH_FIELDS} } } }`,
      { search },
    );
    const result = asRecord(asRecord(data)?.memorialSearch);
    const hits = asArray(result?.memorials).map((item) => toHit(asRecord(item) ?? {}));
    const total = typeof result?.total === "number" ? result.total : hits.length;
    return {
      ok: true,
      total,
      hits,
      openUrl,
      note: [
        "Contributor-submitted Find a Grave memorials, not official death records.",
        "Year filters are exact. If a birth year and a death year together return nobody, search again with one year or with none.",
        placeNote,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return emptySource(openUrl, explainError(error));
  }
}

export async function readBurial(memorialId: string): Promise<BurialRecord> {
  const id = memorialId.trim();
  if (!/^\d{1,12}$/.test(id)) throw new Error("memorial_id must be the numeric Find a Grave id.");
  const data = await graveQuery(
    `query ($ids: [ID!]!) { memorialsById(ids: $ids) { ${READ_FIELDS} } }`,
    { ids: [id] },
  );
  const row = asRecord(asArray(asRecord(data)?.memorialsById)[0]);
  if (!row) throw new Error(`No public memorial ${id}.`);
  const hit = toHit(row);
  const birth = eventText(row.birth);
  const death = eventText(row.death);
  const bio = clip(htmlToText(str(asRecord(row.bio)?.value)), 8000).text;
  return {
    id,
    title: hit.title,
    url: hit.url,
    birth: birth.when,
    death: death.when,
    birthPlace: birth.where,
    deathPlace: death.where,
    cemetery: hit.cemetery,
    cemeteryPlace: hit.place,
    plot: hit.plot,
    inscription: str(asRecord(row.inscription)?.value),
    bio,
    veteran: hit.veteran,
    photo: hit.photo,
  };
}
