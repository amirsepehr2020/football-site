# KICKORA — Stage 1 Cloudflare setup

Stage 1 adds a Cloudflare Pages Function at `/api/football` that securely proxies football-data.org without exposing the API token in browser code.

## 1. Create the API token

Create a free football-data.org account and obtain an API token.

The current free plan provides access to 12 competitions, fixtures, schedules and league tables, with 10 API calls per minute. Live scores are a paid add-on, so KICKORA keeps its existing live-score provider for the live match strip for now.

## 2. Add the Cloudflare secret

In the Cloudflare Pages project:

- Open **Settings → Environment variables**.
- Add a secret/environment variable named `FOOTBALL_DATA_TOKEN`.
- Paste the football-data.org token as its value.
- Add it to the **Production** environment (and Preview too if you want to test previews).
- Redeploy the project.

Do not put the token in `app.js`, `index.html`, GitHub, or any public file.

## 3. API endpoint

The function supports:

- `/api/football?resource=standings&competition=PL`
- `/api/football?resource=matches&competition=PL&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- `/api/football?resource=teams&competition=PL`
- `/api/football?resource=competitions`

Responses are cached at the Cloudflare edge for 60 seconds to reduce upstream calls.

## 4. Stage 1 behavior

The KICKORA standings section automatically tries the new API every 5 minutes. If the secret is not configured yet, the existing fallback table remains visible, so the site does not break.

The visible attribution required by football-data.org is included in the standings section when its data is active.
