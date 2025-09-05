# MCP Audit Frontend (Next.js + Tailwind)

Minimal Next.js App Router frontend to exercise the MCP Hybrid backend.

## Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Install deps and run dev server (port 3001):

```bash
npm install
npm run dev
```

3. Ensure backend is running (port 8010 by default). Update `NEXT_PUBLIC_BACKEND_URL` in `.env` if needed.

## Pages

- `/` — Home
- `/upload` — Upload from Google Drive by File ID via backend `/upload/gdrive`
- `/audit` — Load YAML checklist and score the first question using backend `/score`
- `/dashboard` — Health and frameworks list
- `/report` — Generate a sample report using backend `/report`

## Styling

TailwindCSS is configured with dark mode enabled. Global styles in `src/app/globals.css`.
