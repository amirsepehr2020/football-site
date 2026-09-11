const LEAGUES = {
  'eng.1': { id: 39, name: 'لیگ برتر انگلیس', espn: 'eng.1' },
  'esp.1': { id: 140, name: 'لالیگا', espn: 'esp.1' },
  'ita.1': { id: 135, name: 'سری آ ایتالیا', espn: 'ita.1' },
  'ger.1': { id: 78, name: 'بوندس‌لیگا', espn: 'ger.1' },
  'fra.1': { id: 61, name: 'لیگ یک فرانسه', espn: 'fra.1' },
  'uefa.champions': { id: 2, name: 'لیگ قهرمانان اروپا', espn: 'uefa.champions' }
};

const API_BASE = 'https://v3.football.api-sports.io';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CACHE_SECONDS = { fixtures: 900, standings: 21600, live: 60, news: 600 };

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

const seasonFor = () => {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
};

function apiFootballHasData(payload) {
  return (!payload?.errors || Object.keys(payload.errors).length === 0) && Array.isArray(payload?.response) && payload.response.length > 0;
}

// The frontend consumes this small, stable shape. API-Football's native response is
// deliberately mapped here so UI code never has to know about response[0].teams, etc.
function normalizeFixtures(payload, leagueName = '') {
  return {
    events: (payload?.response || []).map(f => {
      const home = f.teams?.home || {};
      const away = f.teams?.away || {};
      const status = f.fixture?.status || {};
      const short = status.short || 'NS';
      const liveStatuses = ['1H', 'HT', '2H', 'ET', 'P', 'BT', 'LIVE'];
      const preStatuses = ['NS', 'TBD'];
      const state = preStatuses.includes(short) ? 'pre' : liveStatuses.includes(short) ? 'in' : 'post';
      return {
        id: String(f.fixture?.id || ''),
        date: f.fixture?.date || '',
        status: status.long || short || 'Scheduled',
        state,
        league: leagueName || f.league?.name || '',
        home: {
          id: home.id ?? null,
          name: home.name || 'تیم میزبان',
          short: home.name || '',
          logo: home.logo || '',
          score: f.goals?.home ?? 0
        },
        away: {
          id: away.id ?? null,
          name: away.name || 'تیم مهمان',
          short: away.name || '',
          logo: away.logo || '',
          score: f.goals?.away ?? 0
        }
      };
    }).filter(e => e.id)
  };
}

function normalizeStandings(payload) {
  const groups = payload?.response?.[0]?.league?.standings || [];
  const entries = groups.flat ? groups.flat() : (groups[0] || []);
  return {
    standings: entries.map(e => ({
      rank: e.rank,
      team: { id: e.team?.id ?? null, name: e.team?.name || '', logo: e.team?.logo || '' },
      all: {
        played: e.all?.played ?? 0,
        goals: { for: e.all?.goals?.for ?? 0, against: e.all?.goals?.against ?? 0 }
      },
      points: e.points ?? 0,
      form: e.form || '',
      description: e.description || '',
      status: e.status || 'same'
    }))
  };
}

function normalizeEspnEvents(payload, leagueName) {
  return {
    events: (payload?.events || []).map(e => {
      const c = e.competitions?.[0] || {};
      const teams = c.competitors || [];
      const home = teams.find(x => x.homeAway === 'home') || teams[0] || {};
      const away = teams.find(x => x.homeAway === 'away') || teams[1] || {};
      const state = e.status?.type?.state === 'in' ? 'in' : e.status?.type?.completed ? 'post' : 'pre';
      return {
        id: String(e.id || ''),
        date: e.date || '',
        status: e.status?.type?.shortDetail || e.status?.type?.description || '',
        state,
        league: leagueName,
        home: {
          id: home.team?.id ?? null,
          name: home.team?.displayName || 'تیم میزبان',
          short: home.team?.shortDisplayName || home.team?.displayName || '',
          logo: home.team?.logos?.[0]?.href || home.team?.logo || '',
          score: Number(home.score ?? 0)
        },
        away: {
          id: away.team?.id ?? null,
          name: away.team?.displayName || 'تیم مهمان',
          short: away.team?.shortDisplayName || away.team?.displayName || '',
          logo: away.team?.logos?.[0]?.href || away.team?.logo || '',
          score: Number(away.score ?? 0)
        }
      };
    }).filter(e => e.id)
  };
}

function normalizeEspnStandings(payload) {
  const rows = [];
  const entries = payload?.children?.flatMap(c => c.standings?.entries || []) || payload?.standings?.entries || [];
  for (const e of entries) {
    const stats = Object.fromEntries((e.stats || []).map(s => [s.name || s.abbreviation, s.value]));
    rows.push({
      rank: Number(e.position || stats.rank || rows.length + 1),
      team: { name: e.team?.displayName || '', logo: e.team?.logos?.[0]?.href || '' },
      all: { played: Number(stats.gamesPlayed || stats.p || 0), goals: { for: Number(stats.pointsFor || 0), against: Number(stats.pointsAgainst || 0) } },
      points: Number(stats.points || 0)
    });
  }
  return { standings: rows };
}

function normalizeNews(payload) {
  return {
    articles: (payload?.articles || []).map(a => ({
      headline: a.headline || a.title || 'خبر فوتبال',
      description: a.description || a.summary || '',
      published: a.published || a.publishedAt || '',
      image: a.images?.[0]?.url || a.images?.[0]?.data?.url || '',
      link: a.links?.web?.href || a.link || '#'
    }))
  };
}

async function cachedUpstream(request, ttl, headers = {}) {
  const cached = await caches.default.match(request);
  if (cached) return cached;
  const r = await fetch(request, { headers });
  if (!r.ok) return null;
  const text = await r.text();
  await caches.default.put(request, new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': `public, max-age=${ttl}` }
  }));
  return new Response(text, { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });
}

async function apiFootball(env, url, ttl) {
  if (!env.API_FOOTBALL_KEY) return null;
  return cachedUpstream(new Request(url.toString()), ttl, {
    'x-apisports-key': env.API_FOOTBALL_KEY,
    accept: 'application/json'
  });
}

async function espn(url, ttl) {
  return cachedUpstream(new Request(url.toString()), ttl, { accept: 'application/json' });
}

async function football(request, env) {
  const u = new URL(request.url);
  const parts = u.pathname.replace(/^\/api\/football\/?/, '').split('/').filter(Boolean);
  const route = parts[0] || '';

  if (route === 'health') {
    return json({ ok: true, primary: 'API-Football', fallback: 'ESPN', keyConfigured: Boolean(env.API_FOOTBALL_KEY), season: seasonFor(), date: tehranDate() });
  }

  if (route === 'live') {
    const r = await apiFootball(env, new URL(`${API_BASE}/fixtures?live=all`), CACHE_SECONDS.live);
    if (r) {
      const payload = await r.json();
      const ids = new Set(Object.values(LEAGUES).map(x => String(x.id)));
      if (apiFootballHasData(payload)) {
        const filtered = { ...payload, response: (payload.response || []).filter(f => ids.has(String(f.league?.id))) };
        if (filtered.response.length) return json(normalizeFixtures(filtered), 200, CACHE_SECONDS.live);
      }
    }

    const out = await Promise.all(Object.values(LEAGUES).map(async league => {
      const r2 = await espn(new URL(`${ESPN_BASE}/${league.espn}/scoreboard?limit=100`), CACHE_SECONDS.live);
      if (!r2) return [];
      return normalizeEspnEvents(await r2.json(), league.name).events.filter(e => e.state === 'in');
    }));
    return json({ events: out.flat() }, 200, CACHE_SECONDS.live);
  }

  const league = LEAGUES[route];
  if (!league) return json({ error: 'Unknown league', available: Object.keys(LEAGUES) }, 404);

  if (parts[1] === 'news') {
    const r = await espn(new URL(`${ESPN_BASE}/${league.espn}/news?limit=12`), CACHE_SECONDS.news);
    return r ? json(normalizeNews(await r.json()), 200, CACHE_SECONDS.news) : json({ articles: [] }, 200, CACHE_SECONDS.news);
  }

  if (parts[1] === 'standings') {
    const api = new URL(`${API_BASE}/standings`);
    api.searchParams.set('league', String(league.id));
    api.searchParams.set('season', String(seasonFor()));
    const r = await apiFootball(env, api, CACHE_SECONDS.standings);
    if (r) {
      const payload = await r.json();
      if (apiFootballHasData(payload)) {
        const normalized = normalizeStandings(payload);
        if (normalized.standings.length) return json(normalized, 200, CACHE_SECONDS.standings);
      }
    }
    const r2 = await espn(new URL(`${ESPN_BASE}/${league.espn}/standings`), CACHE_SECONDS.standings);
    if (r2) {
      const normalized = normalizeEspnStandings(await r2.json());
      if (normalized.standings.length) return json(normalized, 200, CACHE_SECONDS.standings);
    }
    return json({ standings: [], error: 'No standings provider available' }, 503);
  }

  const api = new URL(`${API_BASE}/fixtures`);
  api.searchParams.set('league', String(league.id));
  api.searchParams.set('season', String(seasonFor()));
  api.searchParams.set('from', tehranDate());
  api.searchParams.set('to', tehranDate(7));
  api.searchParams.set('timezone', 'Asia/Tehran');
  const r = await apiFootball(env, api, CACHE_SECONDS.fixtures);
  if (r) {
    const payload = await r.json();
    if (apiFootballHasData(payload)) {
      const normalized = normalizeFixtures(payload, league.name);
      if (normalized.events.length) return json(normalized, 200, CACHE_SECONDS.fixtures);
    }
  }

  const r2 = await espn(new URL(`${ESPN_BASE}/${league.espn}/scoreboard?limit=100`), CACHE_SECONDS.fixtures);
  if (r2) {
    const normalized = normalizeEspnEvents(await r2.json(), league.name);
    if (normalized.events.length) return json(normalized, 200, CACHE_SECONDS.fixtures);
  }
  return json({ events: [], error: 'No fixtures provider available' }, 503);
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
