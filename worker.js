const LEAGUES = {
  'eng.1': { id: 39, name: 'لیگ برتر انگلیس' },
  'esp.1': { id: 140, name: 'لالیگا' },
  'ita.1': { id: 135, name: 'سری آ ایتالیا' },
  'ger.1': { id: 78, name: 'بوندس‌لیگا' },
  'fra.1': { id: 61, name: 'لیگ یک فرانسه' },
  'uefa.champions': { id: 2, name: 'لیگ قهرمانان اروپا' }
};

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_SECONDS = { fixtures: 60, standings: 900 };

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
const dateUTC = (d = new Date()) => d.toISOString().slice(0, 10);

function normalizeFixtures(payload, leagueName) {
  return { events: (payload.response || []).map(f => {
    const home = f.teams?.home || {}, away = f.teams?.away || {}, s = f.fixture?.status || {};
    const state = s.short === 'NS' ? 'pre' : ['1H','2H','ET','P','LIVE','HT','BT'].includes(s.short) ? 'in' : 'post';
    return {
      id: String(f.fixture?.id || ''), date: f.fixture?.date,
      status: { type: { state, shortDetail: s.long || s.short || 'Scheduled' } },
      competitions: [{ venue: { fullName: f.fixture?.venue?.name || '' }, competitors: [
        { homeAway:'home', score:String(f.goals?.home ?? 0), team:{displayName:home.name || 'تیم میزبان',shortDisplayName:home.name || '',logo:home.logo || ''} },
        { homeAway:'away', score:String(f.goals?.away ?? 0), team:{displayName:away.name || 'تیم مهمان',shortDisplayName:away.name || '',logo:away.logo || ''} }
      ]}], league:{name:leagueName}
    };
  })};
}

function normalizeStandings(payload) {
  const groups = payload.response?.[0]?.league?.standings || [];
  const entries = groups.flat ? groups.flat() : (groups[0] || []);
  return { standings: entries.map(e => ({
    rank:e.rank, team:{name:e.team?.name || '',logo:e.team?.logo || ''},
    all:{played:e.all?.played ?? 0,goals:{for:e.all?.goals?.for ?? 0,against:e.all?.goals?.against ?? 0}},
    points:e.points ?? 0
  }))};
}

async function upstream(env, url, ttl) {
  const key = new Request(url.toString(), { method:'GET' });
  const cached = await caches.default.match(key);
  if (cached) return cached;
  if (!env.API_FOOTBALL_KEY) return json({error:'API_FOOTBALL_KEY is not configured'},503);
  const r = await fetch(url, {headers:{'x-apisports-key':env.API_FOOTBALL_KEY,accept:'application/json'}});
  const body = await r.text();
  const out = new Response(body,{status:r.status,headers:{'content-type':'application/json; charset=UTF-8','cache-control':`public, max-age=${ttl}, s-maxage=${ttl}`}});
  if (r.ok) await caches.default.put(key,out.clone());
  return out;
}

async function football(request, env) {
  const u = new URL(request.url);
  const parts = u.pathname.replace(/^\/api\/football\/?/,'').split('/').filter(Boolean);
  const league = LEAGUES[parts[0]];
  if (!league) return json({error:'Unknown league'},404);
  const type = parts[1] === 'standings' ? 'standings' : 'fixtures';
  const api = new URL(`${API_BASE}/${type}`);
  api.searchParams.set('league',String(league.id));
  api.searchParams.set('season',String(seasonFor()));
  if (type === 'fixtures') {
    api.searchParams.set('date',dateUTC());
    api.searchParams.set('timezone','Asia/Tehran');
    api.searchParams.set('status','NS-1H-HT-2H-ET-P-BT');
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
