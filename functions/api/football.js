const COMPETITIONS = {
  'eng.1': { id: 39, name: 'لیگ برتر انگلیس' },
  'esp.1': { id: 140, name: 'لالیگا' },
  'ita.1': { id: 135, name: 'سری آ ایتالیا' },
  'ger.1': { id: 78, name: 'بوندس‌لیگا' },
  'fra.1': { id: 61, name: 'لیگ یک فرانسه' },
  'uefa.champions': { id: 2, name: 'لیگ قهرمانان اروپا' },
};

const API_BASE = 'https://v3.football.api-sports.io';
const LIVE_TTL = 30;
const FIXTURES_TTL = 900;
const STANDINGS_TTL = 21600;
const NEWS_TTL = 600;

function json(data, status = 200, cacheSeconds = 30, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}`,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      ...extra,
    },
  });
}

function seasonFor(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return month >= 7 ? year : year - 1;
}

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
}

function dateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function competitionFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf('football');
  return index >= 0 && parts[index + 1] && COMPETITIONS[parts[index + 1]] ? parts[index + 1] : 'eng.1';
}

function statusInfo(short = '') {
  const live = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
  const finished = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD']);
  const delayed = new Set(['PST', 'CANC']);
  if (live.has(short)) return { state: 'in', text: short === 'HT' ? 'پایان نیمه اول' : short === 'P' ? 'ضربات پنالتی' : 'زنده' };
  if (finished.has(short)) return { state: 'post', text: short === 'PEN' ? 'پایان با پنالتی' : 'پایان بازی' };
  if (delayed.has(short)) return { state: 'post', text: short === 'PST' ? 'به تعویق افتاده' : 'لغو شده' };
  return { state: 'pre', text: 'برنامه‌ریزی‌شده' };
}

function normalizeFixture(item, competitionName) {
  const fixture = item.fixture || {};
  const home = item.teams?.home || {};
  const away = item.teams?.away || {};
  const status = statusInfo(fixture.status?.short);
  return {
    id: String(fixture.id || ''),
    league: competitionName || item.league?.name || 'فوتبال',
    date: fixture.date || '',
    timestamp: fixture.timestamp || 0,
    status: status.text,
    state: status.state,
    home: { name: home.name || 'تیم میزبان', short: home.name || '', logo: home.logo || '', score: item.goals?.home ?? 0 },
    away: { name: away.name || 'تیم مهمان', short: away.name || '', logo: away.logo || '', score: item.goals?.away ?? 0 },
  };
}

function normalizeStandings(data) {
  const groups = data?.response?.[0]?.league?.standings || [];
  const rows = groups.flatMap(group => Array.isArray(group) ? group : []).map(row => ({
    rank: row.rank,
    team: { name: row.team?.name || 'تیم', logo: row.team?.logo || '' },
    points: row.points ?? 0,
    all: {
      played: row.all?.played ?? 0,
      goals: { for: row.all?.goals?.for ?? 0, against: row.all?.goals?.against ?? 0 },
    },
  }));
  return rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

async function apiFootball(env, path, params = {}) {
  const key = env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured');
  const url = new URL(API_BASE + path);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    headers: { 'x-apisports-key': key, accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
    const detail = typeof data.errors === 'object' ? Object.values(data.errors).join('; ') : `HTTP ${response.status}`;
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return { data, remaining: response.headers.get('x-ratelimit-requests-remaining') || '' };
}

async function cachedFetch(env, request, path, params, ttl, transform) {
  const upstream = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') upstream.searchParams.set(k, String(v));
  const cacheKey = new Request(upstream.toString(), { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);
  const result = await apiFootball(env, path, params);
  const payload = transform(result.data);
  const response = json(payload, 200, ttl, {
    'x-kickorax-data-source': 'api-football',
    ...(result.remaining ? { 'x-api-requests-remaining': result.remaining } : {}),
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

async function handleNews(request) {
  const incoming = new URL(request.url);
  const limit = Math.min(Number(incoming.searchParams.get('limit') || 12), 20);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=${limit}`;
  const cacheKey = new Request(url, { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`News provider HTTP ${response.status}`);
  const data = await response.json();
  const articles = (data.articles || []).map(item => ({
    headline: item.headline || item.title || 'خبر فوتبال',
    description: item.description || item.summary || '',
    published: item.published || '',
    image: item.images?.[0]?.url || '',
    link: item.links?.web?.href || '#',
  }));
  const result = json({ articles }, 200, NEWS_TTL, { 'x-kickorax-data-source': 'espn-news' });
  await cache.put(cacheKey, result.clone());
  return result;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith('/health')) {
    return json({ ok: Boolean(env.API_FOOTBALL_KEY), provider: 'api-football', secret: 'API_FOOTBALL_KEY' }, 200, 30);
  }

  try {
    if (!env.API_FOOTBALL_KEY) {
      return json({ ok: false, error: 'API_FOOTBALL_KEY is not configured in this Worker.' }, 503, 30);
    }

    if (path.endsWith('/news')) return await handleNews(request);

    const competitionKey = competitionFromPath(path);
    const competition = COMPETITIONS[competitionKey];
    const season = seasonFor();

    if (path.endsWith('/live')) {
      return await cachedFetch(env, request, '/fixtures', { live: 'all' }, LIVE_TTL, data => ({
        events: (data.response || []).map(item => normalizeFixture(item, item.league?.name)),
      }));
    }

    if (path.endsWith('/fixtures')) {
      const from = dateOnly(url.searchParams.get('from')) || dateOffset(-2);
      const to = dateOnly(url.searchParams.get('to')) || dateOffset(7);
      return await cachedFetch(env, request, '/fixtures', {
        league: competition.id,
        season,
        from,
        to,
        timezone: 'Asia/Tehran',
      }, FIXTURES_TTL, data => ({
        events: (data.response || []).map(item => normalizeFixture(item, competition.name)),
      }));
    }

    if (path.endsWith('/standings')) {
      return await cachedFetch(env, request, '/standings', {
        league: competition.id,
        season,
      }, STANDINGS_TTL, data => ({ standings: normalizeStandings(data) }));
    }

    if (path.endsWith('/teams')) {
      return await cachedFetch(env, request, '/teams', {
        league: competition.id,
        season,
      }, STANDINGS_TTL, data => ({
        teams: (data.response || []).map(item => ({ team: item.team, venue: item.venue })),
      }));
    }

    if (path.endsWith('/competitions')) {
      return json({ competitions: Object.entries(COMPETITIONS).map(([code, value]) => ({ code, ...value })) }, 200, 21600);
    }

    return json({ ok: false, error: 'Unknown football API route' }, 404, 30);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Football provider error' }, 502, 15);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
}
