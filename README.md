# Aurora

Aurora is a local-first AI chat workspace built with **Next.js 15**, **React 19**, and **TypeScript**. It streams responses from **UnoRouter** (OpenAI-compatible), renders Markdown with custom highlighting and reasoning traces, supports real **web fetch/search** so the model can read live pages, and provides a rich model picker with full per-model stats.

> **Note:** Terminal/workspace shell execution has been removed. The only runtime tool is **`web_fetch`** (server-side HTTP fetch + readable text extraction).

## Quick stats

| Area | Details |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Dev / prod | `npm run dev` and `npm start` on port **5000** (`0.0.0.0`) |
| App routes | `/` (landing), `/new`, `/c/<id>`, `/terms`, `/privacy` |
| API routes | `POST /api/chat` (NDJSON stream), `GET /api/models`, `POST /api/tools/fetch` |
| Provider | UnoRouter `https://api.unorouter.com/v1` (OpenAI-compatible chat + models) |
| Default model | `gpt-oss-120b:free` (env-overridable) |
| Runtime tools | `web_fetch` only (real server-side fetch/read), no terminal |
| Skills | `src/skill/web-fetch`, `src/skill/codex-workflow`, `src/skill/claude-analysis` (loaded into system prompt) |
| Model UI | Search + full stats (provider, context, max output, input/output price, vision, reasoning, pricing, status), desktop dropdown & mobile bottom sheet, copy model id |
| Storage | Theme/prefs/model/conversations and optional user UnoRouter key in browser `localStorage` (`aurora.*`); no server-side DB/account |
| Build | `npm run build` |

## Project structure

```text
src/
  app/
    api/chat/route.ts        # streaming chat proxy, tool loop, rate-limit retry, demo fallback
    api/models/route.ts      # UnoRouter model catalog, ranking, cache, per-user key support
    api/tools/fetch/route.ts # POST web fetch endpoint
    page.tsx, new/, c/[id]/  # landing, new chat, conversation routes
    terms/, privacy/         # legal pages
  components/chat/           # ChatWorkspace, MessageList/Item, Composer, Sidebar, InfoPanel, ModelPicker, etc.
  components/markdown/       # Markdown rendering + CodeBlock
  components/landing/, legal/, system/, ui/
  hooks/                     # useConversations, useModels, useMediaQuery
  lib/
    chat.ts                  # model options/defaults, titles/helpers
    skills.ts                # load SKILL.md files and inject web tool/skill prompt
    toolRuntime.ts           # fetchWeb: real HTTP(S) fetch + readable text extraction
    storage.ts               # localStorage keys (incl. UNOROUTER_KEY)
    demo.ts, export.ts, types.ts, utils.ts, markdown/*
  skill/
    web-fetch/SKILL.md
    codex-workflow/SKILL.md
    claude-analysis/SKILL.md
  styles/                    # chat.css, landing.css, legal.css, markdown.css
```

## Run locally

```bash
npm install
npm run dev
```

- App: `http://localhost:5000`
- Production: `npm run build` then `npm start` (port 5000)

## Configuration

Create `.env.local` (server-side, never exposed to browser):

```bash
UNOROUTER_API_KEY=your_key              # optional on server; users can also enter their own key in UI
UNOROUTER_BASE_URL=https://api.unorouter.com/v1
UNOROUTER_MODEL=gpt-oss-120b:free
```

Behavior:
- Without a valid key (server or user), `/api/chat` falls back to the local **demo** stream and `/api/models` returns curated/fallback models.
- With a key, requests go to UnoRouter live models. Model list is fetched from `/v1/models`, enriched/ranked, and cached (cache bypassed when a user key is supplied via header).

## User-provided UnoRouter API key (browser)

- In chat **InfoPanel → Details** there is an **“UnoRouter API key”** field (show/hide, clear).
- Stored in browser `localStorage` under `aurora.unorouter.key` (persists across refresh). **Clearing site/browser data removes it.**
- Sent to this app’s server only to perform live requests:
  - `GET /api/models` with header `x-unorouter-key: <key>`
  - `POST /api/chat` with body `apiKey: "<key>"` (server prefers provided key over env)
- Use a key you trust; never commit keys to the repo.

## Web fetch / search tool (real)

Aurora can read real websites (and perform URL-based web search by fetching pages) via **`web_fetch`**. There is **no terminal tool**.

### How it works

1. Skills in `src/skill/` are loaded by `src/lib/skills.ts` and injected into the system prompt (cached ~60s).
2. When the user asks to open/read/fetch/check/search/summarize a URL or website, the model must emit a tool call in assistant content (not reasoning):

   ```text
   <tool_call>
   {"name":"web_fetch","arguments":{"url":"https://example.com","maxChars":12000}}
   </tool_call>
   ```

3. `/api/chat` detects tool calls (content/reasoning/native `tool_calls`/`function_call`, JSON/DSML/invoke variants, with intent auto-recovery for explicit URLs, bare domains/paths, and follow-ups like “fetch html” / prior URL) and executes them server-side.
4. The tool result is fed back to the model; it answers using that result (max 6 tool steps/turn). Raw tool-call markup is suppressed from UI; a “Running web_fetch…” notice is shown.

### `fetchWeb` runtime (`src/lib/toolRuntime.ts`)

- Accepts `http`/`https` URLs only (validated); follows redirects.
- Timeout: ~15s. Headers: browser-like `User-Agent`/`Accept`.
- HTML/XHTML: strips scripts/styles/noscript/comments/tags, decodes entities, extracts **title + readable text**.
- JSON/text/xml/js: returns raw text with content-type.
- Binary/other: reports content-type and byte size.
- Output format: `URL`, `Status`, `Title`/`Content-Type`, then body; truncated to `maxChars` (default **12000**, intent recovery may request up to **20000** for “html/source”).
- Returns `{ ok, output }` with real HTTP status/errors (no fabricated content).

### Direct endpoint

```bash
POST /api/tools/fetch
Content-Type: application/json

{"url":"https://example.com","maxChars":12000}
```

Response: `{"ok": boolean, "output": "..."}`

> Fetch results depend on the target site: bot protection/Cloudflare, geo/IP blocks, auth, or rate limits can return 403/challenge/error pages — this is reported as-is from the real fetch.

## Models

- `GET /api/models` returns `{ models, mode: "live"|"demo", defaultModel }`.
- Live mode (with API key): fetches UnoRouter `/v1/models`, normalizes name/vendor/capabilities/context/pricing/max-output, filters non-chat/unsupported, ranks/prioritizes recommended/free/reasoning/vision models, and includes `aurora-demo`.
- Accepts `x-unorouter-key` to use a user key (skips shared cache for that request).
- UI (`ModelPicker`) shows all returned models with searchable list and full stats; selection is per conversation.

## Streaming & reliability

- `/api/chat` streams **NDJSON** frames (`meta`, `reasoning`, `content`, `notice`, `done`, `error`).
- Retries without reasoning params on incompatible 400s; parses delta/message content and reasoning.
- Detects provider rate limits (e.g. “N seconds between messages” / 429) and auto-retries with backoff/notice (up to 5 attempts), respecting abort/stop.
- Tool loop: executes detected/recovered `web_fetch` calls and continues the model turn with `[Tool result: web_fetch]`.

## Data & privacy

- Conversations, preferences, theme, selected model, and optional user API key are stored in browser `localStorage` (`aurora.*`). No account or server-side database.
- Keys are used server-side for provider requests; do not expose secrets in client code or commits.
- Clear via UI actions or remove `aurora.*` keys in browser storage.

## Development notes

```bash
npm run lint
npm run build
npx tsc --noEmit
```

- After changing API routes/lib/skills, **restart/reload the dev server** to pick up changes.
- `web_fetch` is network-dependent and subject to target-site restrictions; missing pricing/max-output fields in model stats render as `—` when the upstream catalog omits them.
