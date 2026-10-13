export type DeskQuery = {
  given: string;
  surname: string;
  words: string;
  birthYear: string;
  deathYear: string;
  place: string;
  paperFrom: string;
  paperTo: string;
  page: number;
  fuzzy: boolean;
};

export type NewspaperHit = {
  id: string;
  title: string;
  url: string;
  date: string;
  newspaper: string;
  page: string;
  place: string;
  image: string;
  excerpt: string;
};

export type WikiHit = {
  id: string;
  name: string;
  url: string;
  title: string;
  birthDate: string;
  deathDate: string;
  birthLocation: string;
  deathLocation: string;
  gender: string;
};

export type BurialHit = {
  id: string;
  title: string;
  url: string;
  birth: string;
  death: string;
  cemetery: string;
  place: string;
  plot: string;
  veteran: boolean;
  photo: boolean;
};

export type SourceResult<T> = {
  ok: boolean;
  total: number | null;
  hits: T[];
  error?: string;
  openUrl: string;
  note?: string;
};

export type DeskResult = {
  newspapers: SourceResult<NewspaperHit>;
  wikitree: SourceResult<WikiHit>;
  burials: SourceResult<BurialHit>;
};

export type NewspaperPage = {
  title: string;
  date: string;
  newspaper: string;
  url: string;
  image: string;
  passage: string;
  text: string;
  truncated: boolean;
};

export type WikiRelative = {
  relation: string;
  name: string;
  url: string;
  dates: string;
};

export type WikiProfile = {
  name: string;
  title: string;
  url: string;
  birthDate: string;
  deathDate: string;
  birthLocation: string;
  deathLocation: string;
  gender: string;
  bio: string;
  relatives: WikiRelative[];
};

export type BurialRecord = {
  id: string;
  title: string;
  url: string;
  birth: string;
  death: string;
  birthPlace: string;
  deathPlace: string;
  cemetery: string;
  cemeteryPlace: string;
  plot: string;
  inscription: string;
  bio: string;
  veteran: boolean;
  photo: boolean;
};

function textOf(value: unknown, max = 120): string {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? String(Math.trunc(value))
      : typeof value === "string"
        ? value
        : "";
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

function year(value: unknown): string {
  const text = textOf(value, 4);
  if (!text) return "";
  if (!/^\d{4}$/.test(text)) throw new Error("Years need four digits, like 1888.");
  const n = Number(text);
  if (n < 1000 || n > 2100) throw new Error("That year is out of range.");
  return text;
}

export function parseDeskQuery(input: unknown): DeskQuery {
  if (!input || typeof input !== "object") throw new Error("Missing search.");
  const raw = input as Record<string, unknown>;
  const query: DeskQuery = {
    given: textOf(raw.given),
    surname: textOf(raw.surname),
    words: textOf(raw.words, 180),
    birthYear: year(raw.birthYear),
    deathYear: year(raw.deathYear),
    place: textOf(raw.place),
    paperFrom: year(raw.paperFrom),
    paperTo: year(raw.paperTo),
    page: 1,
    fuzzy: raw.fuzzy === true,
  };
  const page = Number(raw.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 40) {
    throw new Error("Page must be between 1 and 40.");
  }
  query.page = page;
  if (!query.given && !query.surname && !query.words) {
    throw new Error("Enter a name or some words to search.");
  }
  if (query.paperFrom && query.paperTo && query.paperFrom > query.paperTo) {
    throw new Error("The newspaper start year is after the end year.");
  }
  return query;
}

export function emptySource<T>(openUrl: string, error?: string): SourceResult<T> {
  return { ok: !error, total: error ? null : 0, hits: [], error, openUrl };
}
