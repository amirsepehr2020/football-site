const LEAGUES = {
  'eng.1': { code: 'PL', name: 'لیگ برتر انگلیس' },
  'esp.1': { code: 'PD', name: 'لالیگا' },
  'ita.1': { code: 'SA', name: 'سری آ ایتالیا' },
  'ger.1': { code: 'BL1', name: 'بوندس‌لیگا' },
  'fra.1': { code: 'FL1', name: 'لیگ یک فرانسه' },
  'uefa.champions': { code: 'CL', name: 'لیگ قهرمانان اروپا' }
};

const API_BASE = 'https://api.football-data.org/v4';
const CACHE_SECONDS = { fixtures: 900, standings: 21600, live: 60 };

const json = (data, status = 200, cache = 0) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': cache ? `public, max-age=${cache}, s-maxage=${cache}` : 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  }
});

const tehranDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

async function cachedUpstream(url, ttl, token, extraHeaders = {}) {
  const request = new Request(url.toString(), { method: 'GET' });
  const cached = await caches.default.match(request);
  if (cached) return cached;
  const response = await fetch(request, {
    headers: { accept: 'application/json', ...(token ? { 'X-Auth-Token': token } : {}), ...extraHeaders }
  });
  const body = await response.text();
  if (!response.ok) return new Response(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' }
  });
  const cachedResponse = new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': `public, max-age=${ttl}` }
  });
  await caches.default.put(request, cachedResponse.clone());
  return cachedResponse;
}

async function footballData(env, url, ttl, extraHeaders = {}) {
  if (!env.FOOTBALL_DATA_API_KEY) return null;
  return cachedUpstream(url, ttl, env.FOOTBALL_DATA_API_KEY, extraHeaders);
}

function normalizeMatch(m, leagueName) {
  const status = m.status || 'SCHEDULED';
  const live = ['LIVE', 'IN_PLAY', 'PAUSED'].includes(status);
  const finished = ['FINISHED', 'POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(status);
  return {
    id: String(m.id || ''),
    date: m.utcDate || '',
    status: live ? (m.minute ? `${m.minute}'` : status) : status === 'FINISHED' ? 'پایان بازی' : status === 'SCHEDULED' ? 'برنامه‌ریزی‌شده' : status,
    state: live ? 'in' : finished ? 'post' : 'pre',
    league: leagueName || m.competition?.name || '',
    home: {
      id: m.homeTeam?.id ?? null,
      name: m.homeTeam?.name || m.homeTeam?.shortName || 'تیم میزبان',
      short: m.homeTeam?.shortName || m.homeTeam?.name || '',
      logo: m.homeTeam?.crest || '',
      score: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0
    },
    away: {
      id: m.awayTeam?.id ?? null,
      name: m.awayTeam?.name || m.awayTeam?.shortName || 'تیم مهمان',
      short: m.awayTeam?.shortName || m.awayTeam?.name || '',
      logo: m.awayTeam?.crest || '',
      score: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0
    }
  };
}

function normalizeStandings(payload) {
  const table = payload?.standings?.find(x => x.type === 'TOTAL')?.table || payload?.standings?.[0]?.table || [];
  return { standings: table.map(e => ({
    rank: e.position ?? 0,
    team: { id: e.team?.id ?? null, name: e.team?.shortName || e.team?.name || '', logo: e.team?.crest || '' },
    all: { played: e.playedGames ?? 0, goals: { for: e.goalsFor ?? 0, against: e.goalsAgainst ?? 0 } },
    points: e.points ?? 0,
    form: e.form || ''
  })) };
}

async function football(request, env) {
  const u = new URL(request.url);
  const parts = u.pathname.replace(/^\/api\/football\/?/, '').split('/').filter(Boolean);
  const route = parts[0] || '';

  if (route === 'health') {
    return json({ ok: true, provider: 'football-data.org', keyConfigured: Boolean(env.FOOTBALL_DATA_API_KEY), date: tehranDate() });
  }

  if (route === 'live') {
    const r = await footballData(env, `${API_BASE}/matches?status=IN_PLAY`, CACHE_SECONDS.live);
    if (!r) return json({ events: [], error: 'FOOTBALL_DATA_API_KEY is not configured' }, 503);
    const payload = await r.json();
    if (!Array.isArray(payload.matches)) return json({ events: [], error: 'Invalid provider response' }, 502);
    const allowed = new Set(Object.values(LEAGUES).map(x => x.code));
    return json({ events: payload.matches.filter(m => allowed.has(m.competition?.code)).map(m => normalizeMatch(m)) }, 200, CACHE_SECONDS.live);
  }

  const league = LEAGUES[route];
  if (!league) return json({ error: 'Unknown league', available: Object.keys(LEAGUES) }, 404);

  if (parts[1] === 'standings') {
    const r = await footballData(env, `${API_BASE}/competitions/${league.code}/standings`, CACHE_SECONDS.standings);
    if (!r) return json({ standings: [], error: 'FOOTBALL_DATA_API_KEY is not configured' }, 503);
    const payload = await r.json();
    if (!r.ok) return json({ standings: [], error: payload?.message || 'Provider error' }, r.status);
    return json(normalizeStandings(payload), 200, CACHE_SECONDS.standings);
  }

  if (parts[1] === 'news') return json({ articles: [] }, 200, 300);

  const from = tehranDate();
  const to = tehranDate(7);
  const r = await footballData(env, `${API_BASE}/competitions/${league.code}/matches?dateFrom=${from}&dateTo=${to}`, CACHE_SECONDS.fixtures);
  if (!r) return json({ events: [], error: 'FOOTBALL_DATA_API_KEY is not configured' }, 503);
  const payload = await r.json();
  if (!r.ok) return json({ events: [], error: payload?.message || 'Provider error' }, r.status);
  return json({ events: (payload.matches || []).map(m => normalizeMatch(m, league.name)).filter(m => m.id) }, 200, CACHE_SECONDS.fixtures);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type'
      }
    });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/football')) return football(request, env);
    return env.ASSETS.fetch(request);
  }
};
