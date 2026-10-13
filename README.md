# Reading Room

A no-login MCP server for a Grok bot. One search covers Library of Congress newspaper pages (Chronicling America OCR, about 1756–1963), public WikiTree profiles, and Find a Grave memorials.

The bot endpoint is `https://<your-published-app>/api/mcp`. Streamable HTTP. No token.

## Feed a Grok bot

1. Publish this app so it has a public https address.
2. Open the Reading Room page and copy the MCP link. It ends in `/api/mcp`.
3. In the bot, add a custom remote MCP server, paste that link, and leave the token blank.
4. Paste the instructions from [grokbot.txt](./grokbot.txt).

Tools: `search_records`, `read_newspaper_page`, `read_wikitree`, `read_burial`.
