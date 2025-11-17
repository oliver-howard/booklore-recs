# BookRex

BookRex is a self‑hosted web app that generates LLM-powered book recommendations using your own reading history. It supports BookLore credentials and Goodreads exports, stores everything locally in SQLite (`data/booklore.db`), and keeps your TBR list in sync across sessions.

## Features

- **Data sources**: connect BookLore or upload `goodreads_library_export.csv`. If you have both, pick which source to use (or let the app auto-select).
- **Recommendation modes**: Similar, Contrasting, Blind Spots, Custom prompts, and Reading Statistics.
- **TBR management**: add recs to your list, keep it in SQLite, and surface a random “Up next” book in the hero.
- **Admin tools**: the very first account created becomes an admin. Admins can view users, change passwords, delete accounts, and grant/revoke admin status directly from Settings.
- **Local persistence**: everything lives in `./data/` (auto-created). Keep that folder for upgrades/backups.

## Quick Start (Local Node.js)

```bash
git clone https://github.com/oliver-howard/booklore-recs.git
cd booklore-recs
cp .env.example .env           # add AI API key(s), SESSION_SECRET, TRUST_PROXY, etc.
npm install                    # or npm ci
npm run dev                    # hot reload at http://localhost:3000
# production: npm run build && npm start
```

### Docker

```bash
# Use the published linux/amd64 image (or build locally) and bring everything up
cp .env.example .env                    # set AI keys, SESSION_SECRET, TRUST_PROXY, etc.
docker compose pull                     # pulls ghcr.io/oliver-howard/book-rex:latest
docker compose up -d                    # or docker compose up --build -d
```

- The compose file mounts `./data:/usr/src/app/data`, so container restarts keep your DB.
- To pin versions, set `image: ghcr.io/oliver-howard/book-rex:vX.Y.Z` in `docker-compose.yml` or tag your own build with `docker buildx build --platform linux/amd64 -t <registry>/book-rex:<tag> .`.

## Configuration Notes

- **AI Providers**: configure `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` plus `DEFAULT_AI_PROVIDER` in `.env`.
- **BookLore API URL**: configure 'BOOKLORE_API_URL`
- **Session Security**: set a unique `SESSION_SECRET`.
- **Reverse Proxy Awareness**: configure `TRUST_PROXY` (accepts `true`, `false`, numbers, or IP/subnet strings) so Express trusts your ingress chain—set `true` when running behind Cloudflare/TrueNAS SCALE—and toggle `SESSION_SECURE_COOKIES` if you briefly need HTTP during testing.
- **Data Source Toggle**: appears in Settings when you’ve connected BookLore and imported Goodreads.
- **Admin Actions**: located at the bottom of Settings once logged in as an admin.

## Cleaning / Upgrading

- To upgrade, pull the latest code (`git pull`), keep your existing `.env` and `data/`, then run `npm install` if dependencies changed.
- To reset everything, stop the app, delete `data/`, and restart—Book Rex will recreate a fresh database and treat the next account as admin.

Enjoy your reading journey! 📚✨
