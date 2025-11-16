# Book Rex

Book Rex is a self‑hosted web app that generates LLM-powered book recommendations using your own reading history. It supports BookLore credentials and Goodreads exports, stores everything locally in SQLite (`data/booklore.db`), and keeps your TBR list in sync across sessions.

## Features

- **Data sources**: connect BookLore or upload `goodreads_library_export.csv`. If you have both, pick which source to use (or let the app auto-select).
- **Recommendation modes**: Similar, Contrasting, Blind Spots, Custom prompts, and Reading Statistics.
- **TBR management**: add recs to your list, keep it in SQLite, and surface a random “Up next” book in the hero.
- **Admin tools**: the very first account created becomes an admin. Admins can view users, change passwords, delete accounts, and grant/revoke admin status directly from Settings.
- **Local persistence**: everything lives in `./data/` (auto-created). Keep that folder for upgrades/backups.

## Quick Start

```bash
git clone https://github.com/your-org/book-rex.git
cd book-rex
npm install
cp .env.example .env        # add your AI API key + SESSION_SECRET
npm run dev                 # hot reload
# or npm run build && npm start for production
```

- Visit `http://localhost:3000`, register the first account (auto-admin), then connect BookLore or upload Goodreads data.
- The `data/` directory is ignored in git and created automatically; your local DB persists across restarts. Delete `data/` to start fresh.

### Docker

```
docker-compose up -d
```

`docker-compose.yml` mounts `./data:/usr/src/app/data`, so container restarts keep your DB. Update `.env` for AI keys and `SESSION_SECRET` before launching.

## Configuration Notes

- **AI Providers**: configure `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` plus `DEFAULT_AI_PROVIDER` in `.env`.
- **Session Security**: set a unique `SESSION_SECRET`.
- **Data Source Toggle**: appears in Settings when you’ve connected BookLore and imported Goodreads.
- **Admin Actions**: located at the bottom of Settings once logged in as an admin.

## Cleaning / Upgrading

- To upgrade, pull the latest code (`git pull`), keep your existing `.env` and `data/`, then run `npm install` if dependencies changed.
- To reset everything, stop the app, delete `data/`, and restart—Book Rex will recreate a fresh database and treat the next account as admin.

Enjoy your reading journey! 📚✨
