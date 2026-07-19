<div align="center">

# 📘 SchoolMod 2.0

**The all-in-one student productivity hub.**
SEQTA · Microsoft 365 · AI Notebooks · Flashcards · your Claude subscription — in one beautiful desktop app.

Windows · macOS · Linux · built with Electron + React + TypeScript

</div>

---

SchoolMod started life as a browser extension that patched school websites. **2.0 is a complete ground-up rebuild** — a native desktop app that brings the tools students actually use into one clean, fast, private workspace.

Everything runs **locally on your device**. Your notes, decks and credentials never touch a SchoolMod server (there isn't one).

## ✨ Features

| | |
|---|---|
| 🏠 **Dashboard** | Your day at a glance — greets you by your **real name**, next lesson, assessments due, cards to review, quick actions. |
| ✨ **AI Assistant** | A streaming study chat powered by **your own Claude subscription**. One click installs Claude Code and signs you in — no wrapper or API key to configure. |
| 📓 **Notebooks** | A private **NotebookLM**. Drop in PDFs, Word docs or notes and chat with them — answers are grounded in *your* sources with inline citations. One-click summaries and study guides. |
| 🃏 **Flashcards** | A **Gizmo**-style flashcard engine. Generate cards from any topic or your notes with AI, then review them with proven **SM-2 spaced repetition**. |
| 📅 **SEQTA** | Your live timetable, assessments, homework and notices — plus your name and **student photo** in the corner. Signs in through Microsoft SSO and reads the SEQTA JSON API directly. |
| 🔷 **Microsoft 365** | One-click launch for OneNote, Word, Excel, PowerPoint, Teams, Outlook, OneDrive & To Do, plus your recent OneDrive files via Microsoft Graph. |
| 🧮 **Mathspace** | Launch Mathspace and get step-by-step worked solutions from your AI tutor, with a practice streak tracker. |
| 🎓 **Education Perfect** | Launch EP and get an AI study coach that builds a revision sheet with practice questions for any topic. |
| 🎨 **Polished & yours** | Light/dark themes, 8 accent colours, custom frameless window, keyboard-friendly. |

## 🚀 Download

Grab the latest build from the [Releases page](https://github.com/ZDStudios/SchoolMod/releases):

- **Windows** — `SchoolMod-2.0.0-Setup.exe` (installer) or `SchoolMod-2.0.0-Portable.exe` (no install)
- **macOS** — `SchoolMod-2.0.0-arm64.dmg` (Apple Silicon) / `-x64.dmg` (Intel)
- **Linux** — `SchoolMod-2.0.0.AppImage`

> Builds are currently **unsigned**, so Windows SmartScreen / macOS Gatekeeper will warn on first launch. On Windows choose *More info → Run anyway*; on macOS right-click the app → *Open*.

## 🔌 Connecting your accounts

Open **Settings** in the app to connect each integration. All are optional — use what you want.

### Claude AI (powers the Assistant, Notebooks, Flashcards & study coaches)
**One click.** In **Settings → Claude AI** (mode *Claude Code · one-click*), hit **Connect Claude**. SchoolMod:
1. installs [Claude Code](https://claude.com/claude-code) (`npm i -g @anthropic-ai/claude-code`) if it isn't already,
2. runs the login and opens the authorisation URL in your browser,
3. then drives Claude directly through the CLI with your subscription — no server, no API key.

> *Advanced:* the **OpenAI wrapper** mode still works if you'd rather point at a running [`claude-code-openai-wrapper`](https://github.com/RichardAtCT/claude-code-openai-wrapper).

### SEQTA
Three ways to connect, chosen in **Settings → SEQTA**:

- **SSO (recommended).** Enter your school portal URL, email and password. SchoolMod signs in through Microsoft SSO using a bundled Python helper (needs Python with `requests` + `beautifulsoup4`), then reads the SEQTA JSON API directly — giving you your **real name, student photo**, timetable, assessments, homework and notices. If the HTTP login can't complete, it automatically falls back to a **headless Puppeteer** browser login.
- **MCP server.** SchoolMod acts as an [MCP](https://modelcontextprotocol.io) host and launches the [**Seqta-MCP-Server**](https://github.com/ZDStudios/Seqta-MCP-Server). Point it at how to run the server and hit *Connect & test*.
- **Direct login.** For non-SSO schools: portal URL + username/password. The password goes straight to your school's server; only the session cookie is kept locally.

### Microsoft 365
1. Register a free **public-client** app in [Azure / Entra ID](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app) with device-code flow enabled.
2. Paste the application (client) ID into **Settings → Microsoft** and click **Connect** — you'll get a code to enter at microsoft.com/devicelogin.

## 🛠️ Development

```bash
npm install        # install dependencies
npm run dev        # launch the app with hot-reload
npm run build      # type-check-free production bundle (main + preload + renderer)
npm run build:win  # package Windows installer + portable exe
npm run build:mac  # package macOS dmg + zip (must run on macOS)
```

> **Windows build note:** electron-builder unpacks a `winCodeSign` helper that contains macOS symlinks. If you hit *"Cannot create symbolic link"*, either enable **Windows Developer Mode** (Settings → For developers) or run `node scripts/seed-wincodesign.mjs` once. CI runners are unaffected.

### Tech stack
- **Electron** + **electron-vite** — desktop shell & bundling
- **React 18** + **React Router** + **Zustand** — UI
- **Tailwind CSS** — styling & theming
- **Claude Code CLI** (driven via `claude -p --output-format stream-json`) — the AI, using your subscription
- **OpenAI SDK** — optional wrapper mode
- **@modelcontextprotocol/sdk** — SchoolMod as an MCP host (SEQTA MCP option)
- **puppeteer-core** — headless SEQTA login fallback (uses your system Chrome/Edge)
- **pdfjs-dist** + **mammoth** — document ingestion
- Pure-TypeScript **BM25** retrieval + **SM-2** scheduling — no cloud, no vector DB

### Project structure
```
src/
├── main/            Electron main process
│   ├── index.ts        app lifecycle, window, CSP
│   ├── ipc.ts          typed IPC handlers
│   ├── store.ts        local JSON persistence
│   └── services/       claude · claudeCli · seqta · seqtaDirect · seqtaPuppeteer · mcpClient · notebooks · rag · flashcards · graph
├── preload/         secure contextBridge API (window.api)
├── shared/          types & IPC channel names
└── renderer/src/    React app
    ├── pages/          Dashboard, Assistant, Notebooks, Flashcards, Seqta, Microsoft, Mathspace, EducationPerfect, Settings
    ├── components/     TitleBar, Sidebar, UI kit
    ├── lib/            markdown, helpers
    └── store/          app/theme state
resources/           seqta_session.py (bundled SSO helper)
```

## 🔐 Privacy & scope
SchoolMod is a **study productivity tool**. It does not, and will not, automate quizzes, bypass web filters, or do your assessments for you. Its predecessor's auto-answer bots and filter-bypass tools were intentionally **not** carried over.

## 📄 License
MIT © ZDStudios
