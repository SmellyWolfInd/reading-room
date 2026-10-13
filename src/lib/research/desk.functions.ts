import { createServerFn } from "@tanstack/react-start";
import { parseDeskQuery } from "./types";
import type { BurialRecord, DeskResult, NewspaperPage, WikiProfile } from "./types";

export const searchDesk = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseDeskQuery(input))
  .handler(async ({ data }): Promise<DeskResult> => {
    const { searchAll } = await import("./engine.server");
    return searchAll(data);
  });

export const readDeskPaper = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Missing page.");
    const raw = input as Record<string, unknown>;
    const url = typeof raw.url === "string" ? raw.url : "";
    const focus = typeof raw.focus === "string" ? raw.focus.slice(0, 180) : "";
    const maxRaw = raw.maxChars;
    const maxChars = typeof maxRaw === "number" && Number.isFinite(maxRaw) ? maxRaw : 8000;
    if (!url) throw new Error("Missing loc.gov page URL.");
    return { url, focus, maxChars };
  })
  .handler(async ({ data }): Promise<NewspaperPage> => {
    const { readPaper } = await import("./engine.server");
    return readPaper(data.url, data.focus, data.maxChars);
  });

export const readDeskProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Missing profile.");
    const key = (input as Record<string, unknown>).key;
    if (typeof key !== "string" || !key.trim()) throw new Error("Missing WikiTree id.");
    return { key: key.trim() };
  })
  .handler(async ({ data }): Promise<WikiProfile> => {
    const { readProfile } = await import("./engine.server");
    return readProfile(data.key);
  });

export const readDeskBurial = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Missing memorial.");
    const memorialId = (input as Record<string, unknown>).memorialId;
    if (typeof memorialId !== "string" || !memorialId.trim()) throw new Error("Missing memorial id.");
    return { memorialId: memorialId.trim() };
  })
  .handler(async ({ data }): Promise<BurialRecord> => {
    const { readMemorial } = await import("./engine.server");
    return readMemorial(data.memorialId);
  });
