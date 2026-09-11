const LEAGUES = {
  'eng.1': { id: 39, name: 'لیگ برتر انگلیس' },
  'esp.1': { id: 140, name: 'لالیگا' },
  'ita.1': { id: 135, name: 'سری آ ایتالیا' },
  'ger.1': { id: 78, name: 'بوندس‌لیگا' },
  'fra.1': { id: 61, name: 'لیگ یک فرانسه' },
  'uefa.champions': { id: 2, name: 'لیگ قهرمانان اروپا' }
};

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_SECONDS = {
  fixtures: 60,
  standings: 900,
  teams: 21600
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': extra.cacheControl || 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      ...extra
    }
  });
}

function seasonFor(date = new Date()) {
  return date.getUTCFullYear();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(request) {
  return new Request(request.url, request);
}

async function apiFootballFetch(request, url, cacheSeconds) {
  const cache = caches.default;
  const key = cacheKey(request);
  const cached = await cache.match(key);
  if (cached) return cached;

  const apiKey = request.env?.API_FOOTBALL_KEY;
  if (!apiKey) return json({ error: 'API_FOOTBALL_KEY is not configured' }, 503);

  const upstream = await fetch(url, {
    headers: { 'x-apisports-key': apiKey, accept: 'application/json' }
  });

  const body = await upstream.text();
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    'access-control-allow-origin': '*'
  };

  const response = new Response(body, { status: upstream.status, headers });
  if (upstream.ok) request.waitUntil(cache.put(key, response.clone()));
  return response;
}

function normalizeFixtures(payload, leagueName) {
  return {
    events: (payload.response || []).map((fixture) => {
      const home = fixture.teams?.home || {};
      const away = fixture.teams?.away || {};
      const status = fixture.fixture?.status || {};
      const state = status.short === 'NS' ? 'pre' :
        ['1H', '2H', 'ET', 'P', 'LIVE'].includes(status.short) ? 'in' : 'post';

      return {
        id: String(fixture.fixture?.id || ''),
        date: fixture.fixture?.date,
        status: {
          type: {
            state,
            shortDetail: status.long || status.short || 'Scheduled'
          }
        },
        competitions: [{
          venue: { fullName: fixture.fixture?.venue?.name || '' },
          competitors: [
            {
              homeAway: 'home',
              score: String(fixture.goals?.home ?? 0),
              team: {
                displayName: home.name || 'تیم میزبان',
                shortDisplayName: home.name || '',
                logo: home.logo || ''
              }
            },
            {
              homeAway: 'away',
              score: String(fixture.goals?.away ?? 0),
              team: {
                displayName: away.name || 'تیم مهمان',
                shortDisplayName: away.name || '',
                logo: away.logo || ''
              }
            }
          ]
        }],
        league: { name: leagueName }
      };
    })
  };
}

function normalizeStandings(payload) {
  const entries = payload.response?.[0]?.league?.standings?.[0] || [];
  return {
    standings: entries.map((entry) => ({
      rank: entry.rank,
      team: {
        name: entry.team?.name || '',
        logo: entry.team?.logo || ''
      },
      all: {
        played: entry.all?.played ?? 0,
        goals: {
          for: entry.all?.goals?.for ?? 0,
          against: entry.all?.goals?.against ?? 0
        }
      },
      points: entry.points ?? 0
    }))
  };
}

export async function onRequestGet(context) {
  const rawPath = context.params?.path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const parts = path.split('/').filter(Boolean);
  const league = LEAGUES[parts[0]];

  if (!league) return json({ error: 'Unknown league' }, 404);

  if (parts[1] === 'news') {
    // API-Football is a football-data API, not a news feed.
    // Keep the existing KICKORA fallback news UI instead of mixing providers.
    return json({ articles: [] }, 200, { cacheControl: 'public, max-age=600, s-maxage=600' });
  }

  const endpoint = parts[1] === 'standings' ? 'standings' : 'fixtures';
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('league', String(league.id));
  url.searchParams.set('season', String(seasonFor()));

  if (endpoint === 'fixtures') {
    url.searchParams.set('date', todayUTC());
    url.searchParams.set('timezone', 'Asia/Tehran');
    url.searchParams.set('status', 'NS-1H-HT-2H-ET-P-BT');
    const upstream = await apiFootballFetch(context, url, CACHE_SECONDS.fixtures);
    if (!upstream.ok) return upstream;
    const payload = await upstream.json();
    return json(normalizeFixtures(payload, league.name), 200, {
      cacheControl: `public, max-age=${CACHE_SECONDS.fixtures}, s-maxage=${CACHE_SECONDS.fixtures}`
    });
  }

  const upstream = await apiFootballFetch(context, url, CACHE_SECONDS.standings);
  if (!upstream.ok) return upstream;
  const payload = await upstream.json();
  return json(normalizeStandings(payload), 200, {
    cacheControl: `public, max-age=${CACHE_SECONDS.standings}, s-maxage=${CACHE_SECONDS.standings}`
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type'
    }
  });
}
