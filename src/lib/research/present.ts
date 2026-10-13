import type { BurialRecord, DeskResult, NewspaperPage, WikiProfile } from "./types";

export const BOT_INSTRUCTIONS = [
  "Reading Room is a public research server for a Grok bot. It has no login and no token.",
  "Call search_records first. Split a person into given_name and surname. Pass years as four digits. Use words for text inside a newspaper or memorial, not as a WikiTree name.",
  "Library of Congress hits are OCR excerpts from Chronicling America, about 1756–1963. Before you quote a page, call read_newspaper_page with that url. Cite the url. Treat odd spellings as OCR noise.",
  "WikiTree hits are public profiles only. Call read_wikitree with the id, such as Bow-169, before you summarize a life. A biography is a contributor narrative, not a vital record. Private profiles are not available.",
  "Find a Grave hits are contributor memorials, not official death records. Call read_burial with the numeric memorial id and cite the url. A birth year and a death year together are an exact filter and can miss the right person; if burials come back empty, search again with one year or with none.",
  "Never invent a person, date, relative, cemetery, or quotation the tools did not return. If a source returns an error, say that source failed and use the others.",
].join(" ");

function nextSteps(result: DeskResult): string {
  const failed = [result.newspapers, result.wikitree, result.burials].some((source) => !source.ok);
  return [
    "NEXT",
    "Quote a newspaper page only after read_newspaper_page on that hit's url.",
    "Summarize a WikiTree profile only after read_wikitree on that hit's id.",
    "Summarize a burial only after read_burial on that memorial id.",
    result.burials.ok && result.burials.hits.length === 0
      ? "Burials are empty. If you sent both a birth year and a death year, call search_records again with one year or with neither."
      : "",
    failed ? "A source failed. Do not fill that gap from memory. You may retry once." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function line(label: string, value: string): string {
  return value ? `${label}: ${value}` : "";
}

function section(lines: Array<string | false | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function presentSearch(result: DeskResult): string {
  const papers = result.newspapers;
  const paperHits = papers.hits
    .map((hit, index) =>
      [
        `${index + 1}. ${hit.newspaper || hit.title}`,
        line("date", hit.date),
        line("page", hit.page),
        line("place", hit.place),
        line("url", hit.url),
        line("excerpt", hit.excerpt),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const trees = result.wikitree.hits
    .map((hit, index) =>
      [
        `${index + 1}. ${hit.title} (${hit.name || hit.id})`,
        line("born", [hit.birthDate, hit.birthLocation].filter(Boolean).join(", ")),
        line("died", [hit.deathDate, hit.deathLocation].filter(Boolean).join(", ")),
        line("url", hit.url),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const graves = result.burials.hits
    .map((hit, index) =>
      [
        `${index + 1}. ${hit.title} (memorial ${hit.id})`,
        line("born", hit.birth),
        line("died", hit.death),
        line("cemetery", [hit.cemetery, hit.place].filter(Boolean).join(", ")),
        line("plot", hit.plot),
        hit.veteran ? "veteran: yes" : "",
        hit.photo ? "grave_photo: yes" : "",
        line("url", hit.url),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [
    section([
      "SOURCE Library of Congress — Chronicling America full-page OCR",
      papers.ok ? `total: ${papers.total ?? "unknown"}; showing ${papers.hits.length}` : `error: ${papers.error}`,
      papers.note,
      papers.openUrl ? `search_url: ${papers.openUrl}` : "",
      paperHits || (papers.ok ? "No pages." : ""),
    ]),
    section([
      "SOURCE WikiTree — public profiles only",
      result.wikitree.ok
        ? `total: ${result.wikitree.total ?? "unknown"}; showing ${result.wikitree.hits.length}`
        : `error: ${result.wikitree.error}`,
      result.wikitree.note,
      result.wikitree.openUrl ? `search_url: ${result.wikitree.openUrl}` : "",
      trees || (result.wikitree.ok ? "No profiles." : ""),
    ]),
    section([
      "SOURCE Find a Grave — contributor burials, not official records",
      result.burials.ok
        ? `total: ${result.burials.total ?? "unknown"}; showing ${result.burials.hits.length}`
        : `error: ${result.burials.error}`,
      result.burials.note,
      result.burials.openUrl ? `search_url: ${result.burials.openUrl}` : "",
      graves || (result.burials.ok ? "No memorials." : ""),
    ]),
    nextSteps(result),
  ].join("\n\n");
}

export function presentPaper(page: NewspaperPage): string {
  return [
    section([
      "SOURCE Library of Congress newspaper page OCR",
      "Treat spelling errors as OCR noise. Cite the url.",
      line("title", page.title),
      line("newspaper", page.newspaper),
      line("date", page.date),
      line("url", page.url),
      line("image", page.image),
      page.truncated
        ? "full_text_truncated: true. Call again with a higher max_chars (maximum 20000) if you need more."
        : "full_text_truncated: false",
    ]),
    section(["PASSAGE", page.passage || "(no text)"]),
    section(["FULL_PAGE_TEXT", page.text || "(no OCR text on this page)"]),
  ].join("\n\n");
}

export function presentProfile(profile: WikiProfile): string {
  const relatives = profile.relatives
    .map((item) => `- ${item.relation}: ${item.name}${item.dates ? ` (${item.dates})` : ""} ${item.url}`)
    .join("\n");
  return [
    section([
      "SOURCE WikiTree public profile. Biography is contributor-written.",
      line("name", profile.title),
      line("id", profile.name),
      line("born", [profile.birthDate, profile.birthLocation].filter(Boolean).join(", ")),
      line("died", [profile.deathDate, profile.deathLocation].filter(Boolean).join(", ")),
      line("gender", profile.gender),
      line("url", profile.url),
    ]),
    section(["RELATIVES", relatives || "(none returned)"]),
    section(["BIOGRAPHY", profile.bio || "(no public biography)"]),
  ].join("\n\n");
}

export function presentBurial(record: BurialRecord): string {
  return [
    section([
      "SOURCE Find a Grave memorial. Contributor-submitted, not an official death record.",
      line("name", record.title),
      line("memorial_id", record.id),
      line("born", [record.birth, record.birthPlace].filter(Boolean).join(", ")),
      line("died", [record.death, record.deathPlace].filter(Boolean).join(", ")),
      line("cemetery", [record.cemetery, record.cemeteryPlace].filter(Boolean).join(", ")),
      line("plot", record.plot),
      record.veteran ? "veteran: yes" : "",
      record.photo ? "grave_photo: yes" : "",
      line("url", record.url),
    ]),
    section(["INSCRIPTION", record.inscription || "(none)"]),
    section(["BIOGRAPHY", record.bio || "(none)"]),
  ].join("\n\n");
}
