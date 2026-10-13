import assert from "node:assert/strict";
import test from "node:test";
import { presentPaper, presentSearch } from "./present.ts";
import { retryableLocStatus } from "./loc-retry.ts";
import { decodeEntities, htmlToText, stateFromPlace } from "./text.ts";
import { emptySource, parseDeskQuery } from "./types.ts";

test("decodes escaped biography and OCR text", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &lt;3&gt;"), "Tom & Jerry <3>");
  assert.equal(decodeEntities("&amp;amp;"), "&");
  assert.equal(htmlToText("<p>Born&nbsp;1905 &amp; raised</p>"), "Born 1905 & raised");
  assert.equal(decodeEntities("&#x2019;"), "\u2019");
});

test("retries only transient Library of Congress statuses", () => {
  assert.equal(retryableLocStatus(503), true);
  assert.equal(retryableLocStatus(429), true);
  assert.equal(retryableLocStatus(404), false);
  assert.equal(retryableLocStatus(200), false);
});

test("maps a postal abbreviation in a place", () => {
  assert.equal(stateFromPlace("St. Louis, MO"), "missouri");
  assert.equal(stateFromPlace("NY"), "new york");
  assert.equal(stateFromPlace("Paris"), "");
});

test("rejects a search with no name or words", () => {
  assert.throws(() => parseDeskQuery({}), /name or some words/);
});

test("keeps a blank line between sources", () => {
  const empty = emptySource("https://example.test");
  const text = presentSearch({
    newspapers: { ...empty, ok: true, total: 0, hits: [] },
    wikitree: { ...empty, ok: true, total: 0, hits: [] },
    burials: { ...empty, ok: true, total: 0, hits: [] },
  });
  assert.match(text, /No pages\.\n\nSOURCE WikiTree/);
  assert.match(text, /No profiles\.\n\nSOURCE Find a Grave/);
});

test("separates a newspaper passage from the full page", () => {
  const text = presentPaper({
    title: "Page",
    date: "1905",
    newspaper: "Times",
    url: "https://www.loc.gov/resource/sn/1905-01-01/ed-1/",
    image: "",
    passage: "hello",
    text: "hello world",
    truncated: false,
  });
  assert.match(text, /false\n\nPASSAGE\nhello\n\nFULL_PAGE_TEXT/);
});
