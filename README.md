# ✨ Aegis AI — Executive Assistant

> **Swytchcode Buildathon** | AI Chief of Staff powered by Gmail × Google Calendar × Notion

---

## What It Does

Aegis AI connects your work tools and uses AI reasoning to produce a **unified, prioritised morning briefing** instead of making you manually check three different apps.

```
Gmail + Google Calendar + Notion
           ↓
     AI Reasoning Engine
           ↓
  Cross-source entity linking
           ↓
  Prioritised executive briefing
           ↓
    Dashboard + Email Delivery
```

---

## Quick Start

### 1. Install (zero npm dependencies)

```bash
# No npm install needed — uses only Node.js built-ins + Swytchcode CLI
node -v   # Requires Node.js 18+
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Set to false to run live Swytchcode calls (Gmail + Calendar)
DEMO_MODE=true

# Optional: Add your Gemini API key for richer AI reasoning
GEMINI_API_KEY=AIza...your_key_here

PORT=3000
```

### 3. Run

```bash
node server.js
# or
npm start
```

Open **http://localhost:3000**

---

## Swytchcode Integration

This project uses Swytchcode for all external API calls. The following methods are enabled in `tooling.json`:

| Canonical ID | Purpose |
|---|---|
| `gmail.user.messages.get` | List Gmail inbox messages |
| `gmail.user.messages.get1` | Get full message details |
| `gmail.user.send.create1` | Send email via Gmail API |
| `calendar.event.get` | List Google Calendar events |
| `calendar.event.get.1` | Get a single event by ID |

To run with live data:
1. Set `DEMO_MODE=false` in `.env`
2. Run `swytchcode auth` to configure your Google OAuth credentials
3. Start the server

---

## AI Reasoning Modes

| Mode | How it works |
|---|---|
| **Gemini 2.5 Flash** | Set `GEMINI_API_KEY` — full LLM reasoning over all three data sources |
| **Local Semantic Engine** | Default (no API key) — rule-based entity matching with urgency scoring |

Both modes perform **cross-source linking**: an email from Alice at ABC Corp is automatically related to the ABC Corp meeting and the ABC Corp Notion entry.

---

## Demo Story

The included demo data demonstrates the full briefing flow:

1. **Gmail** — Alice (ABC Corp) sends urgent email about SLA mismatch in the contract
2. **Gmail** — Bob (XYZ Tech) reports an API gateway blocker
3. **Calendar** — ABC Corp alignment meeting at 11:00 AM
4. **Calendar** — Internal API review at 11:30 AM (→ conflict detected!)
5. **Notion** — ABC Corp flagged High priority; XYZ Tech actively onboarding

**What Aegis AI produces:**
- Identifies ABC Corp as Top Priority #1 (email + meeting + Notion context joined)
- Identifies XYZ Tech as Priority #2
- Flags the 11:00–11:30 schedule conflict
- Recommends updating the SLA contract before the meeting
- Allows one-click email delivery of the full briefing

---

## Project Structure

```
buildathon/
├── server.js            # Node.js HTTP server + AI reasoning + Swytchcode subprocess
├── public/
│   ├── index.html       # Dashboard UI
│   ├── index.css        # Premium dark mode design system
│   └── index.js         # Frontend logic (fetch, render, email dispatch)
├── data/
│   └── notion_context.json  # Notion knowledge base (local file)
├── Project_brain/       # PRD, Architecture, Phases, Design, Memory, Tracker
├── .swytchcode/         # Swytchcode tooling.json + integration bundles
├── .env                 # Configuration (gitignored)
├── .env.example         # Configuration template
├── package.json         # Zero-dependency Node project
└── test_briefing.js     # Offline validation of AI reasoning engine
```
