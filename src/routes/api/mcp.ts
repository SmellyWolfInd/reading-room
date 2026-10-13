import { createFileRoute } from "@tanstack/react-router";
import { BOT_INSTRUCTIONS, presentBurial, presentPaper, presentProfile, presentSearch } from "@/lib/research/present";
import { parseDeskQuery } from "@/lib/research/types";

const PROTOCOL = "2025-03-26";
const SERVER_VERSION = "1.2.0";
const SUPPORTED = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id",
  "cache-control": "no-store",
};

const tools = [
  {
    name: "search_records",
    title: "Search newspapers, WikiTree, and burials",
    description:
      "Start here. One call searches Library of Congress newspaper OCR, public WikiTree profiles, and Find a Grave burials. No login. Newspaper hits are excerpts, not full pages. Burial years are exact: if both a birth year and a death year return nobody, call again with one year or none. Do not invent a record when a source errors.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        given_name: { type: "string", description: "Given name or names, not the surname." },
        surname: { type: "string", description: "Surname. Maiden name is also searched on Find a Grave." },
        words: {
          type: "string",
          description: "Words to find in newspaper page OCR and Find a Grave text. Not used as a WikiTree name.",
        },
        birth_year: { type: "string", description: "Four-digit year. WikiTree matches within 2 years." },
        death_year: { type: "string", description: "Four-digit year." },
        place: {
          type: "string",
          description: "A US state filters newspapers. Any place filters WikiTree birthplace and the Find a Grave place index.",
        },
        paper_from: { type: "string", description: "First newspaper year. Coverage is about 1756–1963." },
        paper_to: { type: "string", description: "Last newspaper year." },
        page: { type: "integer", description: "Newspaper result page, from 1." },
        fuzzy_names: {
          type: "boolean",
          description: "Allow surname variants. Default false, which matches the name as written.",
        },
      },
    },
  },
  {
    name: "read_newspaper_page",
    title: "Read a newspaper page",
    description:
      "Read the OCR text of one Library of Congress newspaper page. Call this before quoting a page. Pass a url from search_records and cite that url. OCR spelling is unreliable.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: {
        url: { type: "string", description: "https://www.loc.gov/resource/... URL from search_records." },
        focus: { type: "string", description: "Words to center the passage on. Usually the person's name." },
        max_chars: { type: "integer", description: "Full text length. Default 8000, maximum 20000." },
      },
    },
  },
  {
    name: "read_wikitree",
    title: "Read a WikiTree profile",
    description:
      "Read one public WikiTree profile: dates, biography, and any linked parents, spouses, and children. Pass the id from search_records, such as Bow-169. No login. Private profiles are not available. The biography is contributor-written.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["key"],
      properties: {
        key: { type: "string", description: "WikiTree id, for example Bow-169." },
      },
    },
  },
  {
    name: "read_burial",
    title: "Read a Find a Grave memorial",
    description:
      "Read one Find a Grave memorial: dates, cemetery, plot, inscription, and biography. Pass the numeric memorial id from search_records. Contributor-submitted, not an official death record. No login. Cite the memorial url.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["memorial_id"],
      properties: {
        memorial_id: { type: "string", description: "Numeric Find a Grave memorial id." },
      },
    },
  },
];

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function maxCharsOf(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : 8000;
  if (!Number.isFinite(parsed)) return 8000;
  return Math.min(20000, Math.max(500, Math.trunc(parsed)));
}

function argsOf(params: unknown): Record<string, unknown> {
  const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  const args = record.arguments;
  return args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { readMemorial, readPaper, readProfile, searchAll } = await import("@/lib/research/engine.server");
  if (name === "search_records") {
    const query = parseDeskQuery({
      given: args.given_name,
      surname: args.surname,
      words: args.words,
      birthYear: args.birth_year,
      deathYear: args.death_year,
      place: args.place,
      paperFrom: args.paper_from,
      paperTo: args.paper_to,
      page: args.page,
      fuzzy: args.fuzzy_names === true || args.fuzzy_names === "true" || args.fuzzy_names === 1,
    });
    return textResult(presentSearch(await searchAll(query)));
  }
  if (name === "read_newspaper_page") {
    const url = typeof args.url === "string" ? args.url : "";
    const focus = typeof args.focus === "string" ? args.focus : "";
    const maxChars = maxCharsOf(args.max_chars);
    return textResult(presentPaper(await readPaper(url, focus, maxChars)));
  }
  if (name === "read_wikitree") {
    const key = typeof args.key === "string" ? args.key : "";
    return textResult(presentProfile(await readProfile(key)));
  }
  if (name === "read_burial") {
    const id = typeof args.memorial_id === "string" ? args.memorial_id : String(args.memorial_id ?? "");
    return textResult(presentBurial(await readMemorial(id)));
  }
  throw new Error(`Unknown tool ${name}.`);
}

async function handleMessage(message: unknown): Promise<unknown | null> {
  const body = message && typeof message === "object" ? (message as Record<string, unknown>) : {};
  const id = body.id;
  const method = typeof body.method === "string" ? body.method : "";
  const hasId = Object.prototype.hasOwnProperty.call(body, "id") && id !== undefined;
  if (!method) return rpcError(id, -32600, "Invalid request.");
  if (!hasId || method.startsWith("notifications/")) return null;

  if (method === "initialize") {
    const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL;
    return rpcOk(id, {
      protocolVersion: SUPPORTED.has(requested) ? requested : PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "reading-room", version: SERVER_VERSION },
      instructions: BOT_INSTRUCTIONS,
    });
  }
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/list") return rpcOk(id, { tools });
  if (method === "tools/call") {
    const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
    const name = typeof params.name === "string" ? params.name : "";
    try {
      return rpcOk(id, await callTool(name, argsOf(body.params)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed.";
      return rpcOk(id, textResult(message, true));
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

function answer(request: Request, body: unknown, status = 200) {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
    return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
      status,
      headers: { ...cors, "content-type": "text/event-stream" },
    });
  }
  return Response.json(body, { status, headers: cors });
}

function unsupportedProtocol(request: Request) {
  const version = request.headers.get("mcp-protocol-version");
  if (!version || SUPPORTED.has(version)) return null;
  return answer(request, rpcError(null, -32600, `Unsupported MCP-Protocol-Version ${version}.`), 400);
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const blocked = unsupportedProtocol(request);
        if (blocked) return blocked;
        const accept = request.headers.get("accept") ?? "";
        if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
          return new Response("Method Not Allowed", { status: 405, headers: { ...cors, allow: "POST, OPTIONS" } });
        }
        return answer(request, {
          name: "reading-room",
          transport: "streamable-http",
          protocol: PROTOCOL,
          auth: "none",
          instructions: BOT_INSTRUCTIONS,
          tools: tools.map((tool) => tool.name),
        });
      },
      POST: async ({ request }) => {
        const blocked = unsupportedProtocol(request);
        if (blocked) return blocked;
        let message: unknown;
        try {
          message = await request.json();
        } catch {
          return answer(request, rpcError(null, -32700, "Parse error."), 400);
        }
        if (Array.isArray(message)) {
          const replies = [];
          for (const item of message) {
            const reply = await handleMessage(item);
            if (reply) replies.push(reply);
          }
          if (!replies.length) return new Response(null, { status: 202, headers: cors });
          return answer(request, replies);
        }
        const result = await handleMessage(message);
        if (!result) return new Response(null, { status: 202, headers: cors });
        return answer(request, result);
      },
    },
  },
});
