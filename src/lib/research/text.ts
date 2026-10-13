export function wikiToText(raw: string): string {
  return raw
    .replace(/\[\[Category:[^\]]*\]\]/gi, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/^=+\s*/gm, "")
    .replace(/\s*=+\s*$/gm, "");
}

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code < 32 && code !== 9 && code !== 10 && code !== 13) return "";
  return String.fromCodePoint(code);
}

export function decodeEntities(value: string): string {
  const named = value.replace(/&amp;/g, "&").replace(/&amp;/g, "&");
  return named
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => fromCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec: string) => fromCode(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function clip(text: string, max: number): { text: string; truncated: boolean } {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, max).trimEnd()}…`, truncated: true };
}

export function passageAround(text: string, needle: string, radius = 380): string {
  const hay = text.replace(/\s+/g, " ").trim();
  const terms = needle
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
  if (!hay) return "";
  let at = -1;
  for (const term of terms) {
    const found = hay.toLowerCase().indexOf(term.toLowerCase());
    if (found >= 0) {
      at = found;
      break;
    }
  }
  if (at < 0) return hay.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(hay.length, at + radius);
  const slice = hay.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < hay.length ? "…" : ""}`;
}

export function altoToText(xml: string): string {
  const lines: string[] = [];
  const lineRe = /<TextLine\b[^>]*>([\s\S]*?)<\/TextLine>/g;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(xml))) {
    const words = [...match[1].matchAll(/\bCONTENT="([^"]*)"/g)].map((found) =>
      decodeXml(found[1] ?? ""),
    );
    if (words.length) lines.push(words.join(" "));
  }
  if (lines.length) return lines.join("\n");
  const loose = [...xml.matchAll(/\bCONTENT="([^"]*)"/g)].map((found) => decodeXml(found[1] ?? ""));
  return loose.join(" ");
}

function decodeXml(value: string): string {
  return decodeEntities(value);
}

const STATES: Record<string, string> = {
  alabama: "alabama",
  alaska: "alaska",
  arizona: "arizona",
  arkansas: "arkansas",
  california: "california",
  colorado: "colorado",
  connecticut: "connecticut",
  delaware: "delaware",
  "district of columbia": "district of columbia",
  florida: "florida",
  georgia: "georgia",
  hawaii: "hawaii",
  idaho: "idaho",
  illinois: "illinois",
  indiana: "indiana",
  iowa: "iowa",
  kansas: "kansas",
  kentucky: "kentucky",
  louisiana: "louisiana",
  maine: "maine",
  maryland: "maryland",
  massachusetts: "massachusetts",
  michigan: "michigan",
  minnesota: "minnesota",
  mississippi: "mississippi",
  missouri: "missouri",
  montana: "montana",
  nebraska: "nebraska",
  nevada: "nevada",
  "new hampshire": "new hampshire",
  "new jersey": "new jersey",
  "new mexico": "new mexico",
  "new york": "new york",
  "north carolina": "north carolina",
  "north dakota": "north dakota",
  ohio: "ohio",
  oklahoma: "oklahoma",
  oregon: "oregon",
  pennsylvania: "pennsylvania",
  "rhode island": "rhode island",
  "south carolina": "south carolina",
  "south dakota": "south dakota",
  tennessee: "tennessee",
  texas: "texas",
  utah: "utah",
  vermont: "vermont",
  virginia: "virginia",
  washington: "washington",
  "west virginia": "west virginia",
  wisconsin: "wisconsin",
  wyoming: "wyoming",
  dc: "district of columbia",
  "washington dc": "district of columbia",
  "washington, dc": "district of columbia",
};

const POSTAL: Record<string, string> = {
  al: "alabama",
  ak: "alaska",
  az: "arizona",
  ar: "arkansas",
  ca: "california",
  co: "colorado",
  ct: "connecticut",
  de: "delaware",
  dc: "district of columbia",
  fl: "florida",
  ga: "georgia",
  hi: "hawaii",
  id: "idaho",
  il: "illinois",
  in: "indiana",
  ia: "iowa",
  ks: "kansas",
  ky: "kentucky",
  la: "louisiana",
  me: "maine",
  md: "maryland",
  ma: "massachusetts",
  mi: "michigan",
  mn: "minnesota",
  ms: "mississippi",
  mo: "missouri",
  mt: "montana",
  ne: "nebraska",
  nv: "nevada",
  nh: "new hampshire",
  nj: "new jersey",
  nm: "new mexico",
  ny: "new york",
  nc: "north carolina",
  nd: "north dakota",
  oh: "ohio",
  ok: "oklahoma",
  or: "oregon",
  pa: "pennsylvania",
  ri: "rhode island",
  sc: "south carolina",
  sd: "south dakota",
  tn: "tennessee",
  tx: "texas",
  ut: "utah",
  vt: "vermont",
  va: "virginia",
  wa: "washington",
  wv: "west virginia",
  wi: "wisconsin",
  wy: "wyoming",
};

export function stateFromPlace(place: string): string {
  const key = place.toLowerCase().replace(/\./g, "").trim();
  if (STATES[key]) return STATES[key];
  if (POSTAL[key]) return POSTAL[key];
  const parts = key.split(",").map((part) => part.trim());
  for (const part of parts.reverse()) {
    if (STATES[part]) return STATES[part];
    if (POSTAL[part]) return POSTAL[part];
  }
  return "";
}
