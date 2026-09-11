const LEAGUES = {
  'eng.1': { id: 39, name: 'لیگ برتر انگلیس' },
  'esp.1': { id: 140, name: 'لالیگا' },
  'ita.1': { id: 135, name: 'سری آ ایتالیا' },
  'ger.1': { id: 78, name: 'بوندس‌لیگا' },
  'fra.1': { id: 61, name: 'لیگ یک فرانسه' },
  'uefa.champions': { id: 2, name: 'لیگ قهرمانان اروپا' }
};

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_SECONDS = { fixtures: 600, standings: 3600, live: 120 };

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

const seasonFor = () => new Date().getUTCFullYear();
const tehranDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function normalizeFixtures(payload, leagueName = '') {
  return { events: (payload.response || []).map(f => {
    const home = f.teams?.home || {}, away = f.teams?.away || {}, s = f.fixture?.status || {};
    const short = s.short || '';
    const state = ['NS', 'TBD'].includes(short) ? 'pre' : ['1H','2H','ET','P','LIVE','HT','BT'].includes(short) ? 'in' : 'post';
    return {
      id: String(f.fixture?.id || ''),
      date: f.fixture?.date,
      status: { type: { state, shortDetail: s.long || short || 'Scheduled' } },
      competitions: [{ venue: { fullName: f.fixture?.venue?.name || '' }, competitors: [
        { homeAway:'home', score:f.goals?.home == null ? '0' : String(f.goals.home), team:{displayName:home.name || 'تیم میزبان',shortDisplayName:home.name || '',logo:home.logo || ''} },
        { homeAway:'away', score:f.goals?.away == null ? '0' : String(f.goals.away), team:{displayName:away.name || 'تیم مهمان',shortDisplayName:away.name || '',logo:away.logo || ''} }
      ]}],
      league:{name:leagueName || f.league?.name || ''}
    };
  })};
}

function normalizeStandings(payload) {
  const groups = payload.response?.[0]?.league?.standings || [];
  const entries = groups.flat ? groups.flat() : (groups[0] || []);
  return { standings: entries.map(e => ({
    rank:e.rank,
    team:{name:e.team?.name || '',logo:e.team?.logo || ''},
    all:{played:e.all?.played ?? 0,goals:{for:e.all?.goals?.for ?? 0,against:e.all?.goals?.against ?? 0}},
    points:e.points ?? 0
  }))};
}

async function upstream(env, url, ttl) {
  const key = new Request(url.toString(), { method:'GET' });
  const cached = await caches.default.match(key);
  if (cached) return cached;
  if (!env.API_FOOTBALL_KEY) return json({error:'API_FOOTBALL_KEY is not configured on this Worker'},503);
  const r = await fetch(url, {headers:{'x-apisports-key':env.API_FOOTBALL_KEY,accept:'application/json'}});
  const body = await r.text();
  const out = new Response(body,{status:r.status,headers:{'content-type':'application/json; charset=UTF-8','cache-control':`public, max-age=${ttl}, s-maxage=${ttl}`}});
  if (r.ok) await caches.default.put(key,out.clone());
  return out;
}

async function football(request, env) {
  const u = new URL(request.url);
  const parts = u.pathname.replace(/^\/api\/football\/?/,'').split('/').filter(Boolean);
  const route = parts[0] || '';

  if (route === 'health') {
    return json({ok:true, provider:'API-Football', keyConfigured:Boolean(env.API_FOOTBALL_KEY), season:seasonFor(), time:tehranDate()});
  }

  if (route === 'live') {
    const leagueIds = Object.values(LEAGUES).map(x => x.id).join('-');
    const api = new URL(`${API_BASE}/fixtures`);
    api.searchParams.set('live', leagueIds);
    const r = await upstream(env, api, CACHE_SECONDS.live);
    if (!r.ok) return r;
    const payload = await r.json();
    return json(normalizeFixtures(payload, ''), 200, CACHE_SECONDS.live);
  }

  const league = LEAGUES[route];
  if (!league) return json({error:'Unknown league', available:Object.keys(LEAGUES)},404);

  const type = parts[1] === 'standings' ? 'standings' : 'fixtures';
  const api = new URL(`${API_BASE}/${type}`);
  api.searchParams.set('league',String(league.id));
  api.searchParams.set('season',String(seasonFor()));

  if (type === 'fixtures') {
    // Allow ?date=YYYY-MM-DD, otherwise return a useful 7-day schedule.
    const requestedDate = u.searchParams.get('date');
    if (requestedDate) {
      api.searchParams.set('date', requestedDate);
    } else {
      api.searchParams.set('from', tehranDate(0));
      api.searchParams.set('to', tehranDate(7));
    }
    api.searchParams.set('timezone','Asia/Tehran');
    const r = await upstream(env,api,CACHE_SECONDS.fixtures);
    if (!r.ok) return r;
    return json(normalizeFixtures(await r.json(),league.name),200,CACHE_SECONDS.fixtures);
  }

  const r = await upstream(env,api,CACHE_SECONDS.standings);
  if (!r.ok) return r;
  return json(normalizeStandings(await r.json()),200,CACHE_SECONDS.standings);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Content-Type'}});
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/football')) return football(request,env);
    return env.ASSETS.fetch(request);
  }
};
