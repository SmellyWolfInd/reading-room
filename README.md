# Reading Room

A no-login MCP server for a Grok bot. One search covers Library of Congress newspaper pages (Chronicling America OCR, about 1756–1963), public WikiTree profiles, and Find a Grave memorials.

The bot endpoint is `https://<your-published-app>/api/mcp`. Streamable HTTP. No token.

## Feed a Grok bot

1. Publish this app so it has a public https address.
2. Open the Reading Room page and copy the MCP link. It ends in `/api/mcp`.
3. In the bot, add a custom remote MCP server, paste that link, and leave the token blank.
4. Paste the instructions from [grokbot.txt](./grokbot.txt).

Tools: `search_records`, `read_newspaper_page`, `read_wikitree`, `read_burial`.

`search_records` always returns all three sources. A source that fails has an `error:` line and does not remove the others. Library of Congress is often slow: the newspaper search waits up to 40 seconds, then waits 2 seconds and tries once more for up to 50 seconds. The whole call can take about 100 seconds when loc.gov is slow. WikiTree and Find a Grave are not cancelled by that wait.

## Self-host

Node.js 22. No API key, no account, and no database.

| Setting | Value |
|---|---|
| `VITE_AUTH_ENABLED` | `false`. Set this before `npm run build`. If it is unset, the page expects sign-in. `/api/mcp` itself does not check a session. |
| `DATABASE_URL` | Leave unset. The build's migrate step skips, and the process uses embedded PGLite. Do not point this at a shared database while auth is off. |
| Port | Whatever you pass to `vite preview`. The sample below uses `8787`. |

`npm ci` installs the toolchain, so do not set `NODE_ENV=production` for that step. The lockfile matches `package.json`.

```bash
git clone https://github.com/SmellyWolfInd/reading-room.git
cd reading-room
npm ci
VITE_AUTH_ENABLED=false npm run build
npm run preview -- --host 127.0.0.1 --port 8787
```

The endpoint is `http://127.0.0.1:8787/api/mcp`. The build is written in Vercel output form; `npm run preview` is what serves it. `npm run build` also runs migrations, which print a skip line when `DATABASE_URL` is unset.

### systemd

`/etc/systemd/system/reading-room.service`:

```ini
[Unit]
Description=Reading Room MCP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/reading-room
Environment=NODE_ENV=production
Environment=VITE_AUTH_ENABLED=false
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 8787
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Build once in `/opt/reading-room` with the commands above, then:

```bash
sudo systemctl enable --now reading-room
```

### stdio bridge

Clients that only speak stdio can bridge to the local server:

```bash
npx mcp-remote http://127.0.0.1:8787/api/mcp --transport http-only
```

