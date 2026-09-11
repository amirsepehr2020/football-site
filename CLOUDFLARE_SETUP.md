# KICKORAX — API-Football setup

KICKORAX now uses **API-Football / API-SPORTS** as its football-data provider through a Cloudflare Pages Function. The API key stays server-side and is never shipped to browser JavaScript.

## 1. API key

Create an API-Football account and use the API key from the API-SPORTS dashboard.

The current free plan includes all listed football endpoints and competitions, with **100 requests/day** and a per-minute limit. urlAPI-Football pricinghttps://www.api-football.com/pricing

## 2. Cloudflare secret

In the Cloudflare Pages project:

- Open **Settings → Environment variables**.
- Add a secret named `API_FOOTBALL_KEY`.
- Paste the API key as its value.
- Add it to the **Production** environment (and Preview if needed).
- Redeploy the project.

Never put the key in `app-fixed.js`, `index.html`, GitHub, or another public file.

## 3. KICKORAX API routes

The Pages Function exposes a stable frontend API:

- `/api/football/health`
- `/api/football/eng.1/fixtures`
- `/api/football/esp.1/fixtures`
- `/api/football/ita.1/fixtures`
- `/api/football/ger.1/fixtures`
- `/api/football/fra.1/fixtures`
- `/api/football/uefa.champions/fixtures`
- `/api/football/live`
- `/api/football/eng.1/standings`
- `/api/football/eng.1/teams`
- `/api/football/eng.1/news`

The Worker translates API-Football's response format into the small, stable format consumed by the frontend.

## 4. Caching / quota protection

API-Football's free plan is limited to 100 requests/day, so KICKORAX deliberately does not poll the provider every few seconds.

- Live endpoint: cached for 20 minutes.
- Fixtures: cached for 24 hours.
- Standings: cached for 24 hours.
- News: cached for 10 minutes.

This is intentionally conservative so multiple visitors can reuse Cloudflare's cached response instead of independently consuming the API quota.

API-Football documents `/fixtures?live=all` for live matches, `league + season + from/to` for schedules, and `standings?league=...&season=...` for tables. It also recommends checking the `errors`, `results`, `paging`, and rate-limit headers in API responses. urlAPI-Football documentation guidehttps://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginner-s-guide

## 5. Important

After changing the secret or code, **redeploy the Cloudflare Pages project**. The GitHub commit alone does not deploy a Pages Function unless the repository is connected to the Pages project.
