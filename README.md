# BookLore AI Recommendations

Modern LLM-powered book recommendations with a full web UI, local user accounts, flexible data sources, and tight integrations with BookLore, Goodreads, Amazon, and Hardcover.

## Key Features

- **Local Accounts & Secure Sessions**
  - Users register with a username/password (bcrypt hashed in `data/booklore.db`)
  - Session cookies keep requests scoped to a single user; logging out clears all in-memory state immediately

- **Multiple Data Sources per User**
  - Store BookLore credentials to pull canonical reading history directly from the BookLore API
  - Upload Goodreads `goodreads_library_export.csv` to seed recommendations without BookLore
  - Either source (or both) unlocks the Similar / Contrasting / Blind Spots / Statistics tabs

- **Recommendation Modes**
  - *Similar*: Books aligned with recent favorites
  - *Contrasting*: Opposing viewpoints or genres to stretch reading habits
  - *Blind Spots*: Pattern analysis + targeted fills for gaps
  - *Custom*: User-defined prompt criteria
  - *Statistics*: Summaries of ratings, top genres/authors, etc.
  - Powered by Anthropic Claude (default), OpenAI GPT‑4o, or Google Gemini, all configurable via `.env`

- **TBR & Hardcover Sync**
  - Add recommendations to a per-user “To Be Read” queue stored in SQLite
  - TBR tab automatically loads on focus and matches the rec-card styling
  - One-click sync pushes unsynced TBR items to the Hardcover “Want to Read” shelf and pulls missing books down, keeping both lists aligned
  - Removing/clearing TBR uses in-app toasts (no browser alert spam)

- **Amazon Integration**
  - Every recommendation includes a stylized “View on Amazon →” button (ready for optional affiliate tags)

- **Responsive, Themed UI**
  - Dark/light toggle, tabbed navigation, contextual loaders, inline notifications, and detailed cards that explain *why* each book was suggested

## Tech Stack

| Layer        | Tech                                                                 |
|--------------|----------------------------------------------------------------------|
| Frontend     | Vanilla JS, semantic HTML, handcrafted CSS with theme variables      |
| Backend API  | Express.js (ES modules) + session middleware                          |
| Persistence  | SQLite via `better-sqlite3` (users, data sources, TBR)               |
| Auth & Data  | BookLore client, Goodreads CSV parser, Hardcover GraphQL client      |
| AI Providers | Anthropic, OpenAI, Google (configure per environment)                |

## Getting Started

```bash
git clone https://github.com/your-org/booklore_recs.git
cd booklore_recs
npm install
cp .env.example .env   # edit with AI keys + SESSION_SECRET
npm run dev            # or npm run build && npm start
```

### Environment Variables (excerpt)

```env
BOOKLORE_API_URL=https://api.booklore.app
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=optional_other_key
GOOGLE_API_KEY=optional_other_key
DEFAULT_AI_PROVIDER=anthropic   # anthropic | openai | google
SESSION_SECRET=change-me
PORT=3000
# Optional: AMAZON_AFFILIATE_TAG=xxxx
```

BookLore/Goodreads/Hardcover credentials are **not** stored in `.env`; they are entered per user inside the Settings tab.

## Typical Workflow

1. **Visit** `http://localhost:3000` (or your deployed host).
2. **Register/Login** in the modal. The header shows your username once signed in.
3. **Settings → BookLore**: enter BookLore credentials (optional).
4. **Settings → Goodreads**: upload `goodreads_library_export.csv` (optional).
5. **Recommendation Tabs**: run Similar / Contrasting / Blind Spots / Custom / Statistics.
6. **TBR Tab**:
   - Add any recommendation via “Add to TBR”.
   - Switch to the TBR tab to see cards with dates, reasoning, and Amazon links.
   - Sync to Hardcover’s Want to Read shelf; imported books are marked automatically.
7. **Logout**: instantly clears all UI data and session info so the next user starts fresh.

## API Reference (per authenticated session)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create local account |
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/status` | GET | Auth & data-source status |
| `/api/settings/booklore` | POST/DELETE | Save or remove BookLore credentials |
| `/api/settings/goodreads` | POST/DELETE | Upload or clear Goodreads CSV |
| `/api/recommendations/*` | POST | similar / contrasting / blindspots / custom |
| `/api/stats` | GET | Reading statistics |
| `/api/tbr` | GET/POST/DELETE | Manage TBR entries (bulk delete with DELETE `/api/tbr`) |
| `/api/hardcover/*` | GET/POST | Manage Hardcover API token + trigger full sync |

## Development Scripts

```bash
npm run dev    # tsx hot reload
npm run build  # tsc + copy public assets
npm start      # run compiled server
```

## Troubleshooting Notes

- **Authentication failures**: Ensure `SESSION_SECRET` is set and cookies are allowed. Re-register if necessary; database lives in `data/booklore.db`.
- **No recommendation tabs enabled**: Connect either BookLore credentials or upload a Goodreads CSV.
- **Hardcover sync errors**: Verify the Hardcover token via Settings → Hardcover; the sync endpoint logs detailed GraphQL feedback in the server console.
- **AI provider issues**: Provide only one active API key or set `DEFAULT_AI_PROVIDER` to the matching service.

## Roadmap Ideas

- Amazon affiliate tagging & richer Product Advertising info
- TBR history/export, rating sync back to Hardcover
- Multi-user admin dashboard, sharing/sharing workflows
- Cached reading histories to reduce API churn

---

Built for avid readers who want Unearthed-style, explainable recommendations with total control over their data sources. Happy reading! 📚✨
