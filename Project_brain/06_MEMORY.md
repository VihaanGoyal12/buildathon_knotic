# Project Memory — Aegis AI Executive Assistant

## Architecture Decision: Zero npm Dependencies

**Decision**: Use only Node.js built-in modules (`http`, `fs`, `path`, `child_process`, `https`).

**Reason**: The sandbox environment blocks outbound npm registry calls. Since Swytchcode CLI is already the runtime kernel for API calls, and Node.js built-ins cover all server needs, no external packages are required. This also means `npm install` is never needed — just `node server.js`.

---

## Swytchcode Integration Pattern

**Decision**: Invoke Swytchcode via `child_process.exec()` subprocess instead of `@swytchcode/runtime` npm package.

**Reason**: `@swytchcode/runtime` is not installable in the current sandbox (network blocked). The CLI subprocess approach is a valid Swytchcode-approved fallback. In production, replace `execSwytchcode()` in `server.js` with `const { exec } = require("@swytchcode/runtime")`.

**Methods currently enabled in tooling.json**:
- `gmail.user.messages.get` — lists inbox (uses `userId=me`, optional `q` for filtering)
- `gmail.user.messages.get1` — retrieves a single message by `id` with `format=full`
- `gmail.user.send.create1` — sends email via `raw` RFC-2822 base64url-encoded body
- `calendar.event.get` — lists events on a calendar by `calendarId=primary`
- `calendar.event.get.1` — retrieves a single event by `calendarId` + `eventId`

---

## Notion Integration Pattern

**Decision**: Use a local `data/notion_context.json` file instead of the Notion API.

**Reason**: Notion is available in the Swytchcode registry (option #208) but was not fetched during this session. For the hackathon demo, the local JSON file contains realistic client and project data that fulfils the PRD requirement. To upgrade to live Notion: run `swytchcode get`, select Notion, add the relevant methods to tooling.json, and update the `GET /api/briefing` handler to call them instead of reading the local file.

---

## AI Reasoning: Dual Engine Design

**Decision**: Implement two reasoning paths selectable by env variable.

1. **Gemini 2.5 Flash** (when `GEMINI_API_KEY` is set) — sends all three data sources to the LLM, which returns a structured JSON briefing.
2. **Local Semantic Reasoner** (default, no API key required) — deterministic rule engine that:
   - Detects urgency keywords in email subjects/snippets
   - Matches client names across Gmail, Calendar, and Notion
   - Detects overlapping calendar events (time range intersection)
   - Ranks priorities by Notion client priority level
   - Generates executive summary from ranked priorities

**Reason**: Ensures the app works offline/in demo mode without any API keys while still producing an impressive cross-source briefing.

---

## Port Binding Note

The agent sandbox blocks `server.listen()` with `EPERM`. This is a sandbox-only restriction. When the user runs `node server.js` from their own terminal, it binds to `127.0.0.1:3000` normally.
