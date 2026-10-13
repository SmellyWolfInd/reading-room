import type { DeskQuery, NewspaperHit, NewspaperPage, SourceResult } from "./types";
import { emptySource } from "./types";
import { fetchText } from "./http.server";
import { asArray, asRecord, explainError, str, strList } from "./json";
import { altoToText, clip, passageAround, stateFromPlace } from "./text";

const PAGE_HOSTS = ["www.loc.gov", "loc.gov", "chroniclingamerica.loc.gov"];
const OCR_HOSTS = ["tile.loc.gov"];

function newspaperQuery(query: DeskQuery): string {
  return [query.given, query.surname, query.words].filter(Boolean).join(" ").trim();
}

function locUrls(query: DeskQuery, q: string): { api: string; open: string } {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("dl", "page");
  params.set("c", "6");
  params.set("sp", String(query.page));
  const state = stateFromPlace(query.place);
  if (state) params.set("location_state", state);
  let tail = params.toString();
  if (query.paperFrom || query.paperTo) {
    const from = query.paperFrom || "1756";
    const to = query.paperTo || "1963";
    tail += `&dates=${from}/${to}`;
  }
  const open = `https://www.loc.gov/collections/chronicling-america/?${tail}`;
  return { open, api: `${open}&fo=json&at=results,pagination` };
}

function pageLabel(value: unknown): string {
  const raw = strList(value).replace(/^0+/, "");
  return raw || "";
}

export async function searchNewspapers(query: DeskQuery): Promise<SourceResult<NewspaperHit>> {
  const q = newspaperQuery(query);
  const { api, open } = locUrls(query, q || " ");
  if (!q) {
    return emptySource(open, "Add a name or words. Newspaper search is full-page OCR, not a name index.");
  }
  try {
    const { status, text } = await fetchText(api, "application/json, text/plain, */*", 45000, PAGE_HOSTS);
    if (status < 200 || status >= 300) {
      return emptySource(open, `Library of Congress returned ${status}.`);
    }
    const body = JSON.parse(text) as unknown;
    const root = asRecord(body);
    const pagination = asRecord(root?.pagination);
    const total = typeof pagination?.of === "number" ? pagination.of : null;
    const hits: NewspaperHit[] = asArray(root?.results).map((item) => {
      const row = asRecord(item) ?? {};
      const images = asArray(row.image_url).map((image) => str(image).split("#")[0]).filter(Boolean);
      const url = str(row.url).split("&")[0] || str(row.id);
      return {
        id: str(row.id) || url,
        title: str(row.title) || "Newspaper page",
        url,
        date: str(row.date),
        newspaper: strList(row.partof_title),
        page: pageLabel(row.number_page ?? row.shelf_id),
        place: [strList(row.location_city), strList(row.location_state)].filter(Boolean).join(", "),
        image: images[1] || images[0] || "",
        excerpt: strList(row.description).replace(/\s+/g, " ").slice(0, 420),
      };
    });
    const note = [
      "OCR excerpts from Chronicling America newspaper pages (about 1756–1963).",
      "Call read_newspaper_page with a url for the full page text.",
      query.place && !stateFromPlace(query.place)
        ? "Place was not a US state, so it was not applied to the newspaper search."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { ok: true, total, hits, openUrl: open, note };
  } catch (error) {
    return emptySource(open, explainError(error));
  }
}

function assertLocPage(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a loc.gov page URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Full page text is only read from loc.gov.");
  }
  if (url.hostname !== "www.loc.gov" && url.hostname !== "loc.gov") {
    throw new Error("Full page text is only read from loc.gov.");
  }
  if (!url.pathname.startsWith("/resource/") && !url.pathname.startsWith("/item/")) {
    throw new Error("Pass a loc.gov /resource/ or /item/ URL from search_records.");
  }
  return url;
}

function allowedOcrFile(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Refused an unexpected text file host.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !OCR_HOSTS.includes(url.hostname)) {
    throw new Error("Refused an unexpected text file host.");
  }
  return url.toString();
}

function xmlUrl(payload: unknown): string {
  const root = asRecord(payload);
  for (const entry of asArray(root?.page)) {
    const row = asRecord(entry);
    const url = str(row?.url);
    if (url.endsWith(".xml")) return url.startsWith("//") ? `https:${url}` : url;
  }
  const resource = asRecord(root?.resource);
  const full = str(resource?.fulltext_file);
  return full.startsWith("//") ? `https:${full}` : full;
}

export async function readNewspaperPage(rawUrl: string, focus: string, maxChars: number): Promise<NewspaperPage> {
  const pageUrl = assertLocPage(rawUrl);
  pageUrl.searchParams.delete("fo");
  pageUrl.searchParams.set("fo", "json");
  const { status, text } = await fetchText(pageUrl.toString(), "application/json, text/plain, */*", 45000, PAGE_HOSTS);
  if (status < 200 || status >= 300) throw new Error(`Library of Congress returned ${status}.`);
  const payload = JSON.parse(text) as unknown;
  const root = asRecord(payload);
  const item = asRecord(root?.item);
  const segment = asRecord(asArray(root?.segments)[0]);
  const source = segment ?? item ?? {};
  const images = asArray(source.image_url).map((image) => str(image).split("#")[0]).filter(Boolean);
  const canonical = str(source.url) || rawUrl.split("?")[0];
  const xml = xmlUrl(payload);
  let ocr = "";
  if (xml) {
    const file = await fetchText(allowedOcrFile(xml), "text/xml, application/xml, text/plain", 25000, OCR_HOSTS);
    if (file.status >= 200 && file.status < 300) ocr = altoToText(file.text);
  }
  if (!ocr) ocr = strList(source.description);
  const limit = Number.isFinite(maxChars) ? Math.trunc(maxChars) : 8000;
  const clipped = clip(ocr, Math.min(20000, Math.max(500, limit)));
  return {
    title: str(source.title) || str(root?.title) || "Newspaper page",
    date: str(source.date) || str(item?.date),
    newspaper: strList(source.partof_title) || strList(item?.partof_title),
    url: canonical,
    image: images[2] || images[1] || images[0] || "",
    passage: passageAround(ocr, focus || str(source.title)),
    text: clipped.text,
    truncated: clipped.truncated,
  };
}
