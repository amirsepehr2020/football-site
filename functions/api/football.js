const ALLOWED_RESOURCES = new Set(['matches', 'standings', 'teams', 'competitions']);
const DEFAULT_COMPETITION = 'PL';
const CACHE_TTL = 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_TTL}`,
      ...extraHeaders,
    },
  });
}

function dateOnly(value) {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function buildUpstreamUrl(request) {
  const incoming = new URL(request.url);
  const resource = incoming.searchParams.get('resource') || 'matches';
  const competition = incoming.searchParams.get('competition') || DEFAULT_COMPETITION;

  if (!ALLOWED_RESOURCES.has(resource)) {
    throw new Error('Unsupported resource');
  }

  let path;
  if (resource === 'matches') {
    path = `/v4/competitions/${encodeURIComponent(competition)}/matches`;
    const dateFrom = dateOnly(incoming.searchParams.get('dateFrom'));
    const dateTo = dateOnly(incoming.searchParams.get('dateTo'));
    const status = incoming.searchParams.get('status');
    const matchday = incoming.searchParams.get('matchday');
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (status) params.set('status', status);
    if (matchday && /^\d+$/.test(matchday)) params.set('matchday', matchday);
    if ([...params].length) path += `?${params}`;
  } else if (resource === 'standings') {
    path = `/v4/competitions/${encodeURIComponent(competition)}/standings`;
  } else if (resource === 'teams') {
    path = `/v4/competitions/${encodeURIComponent(competition)}/teams`;
  } else {
    path = '/v4/competitions/';
  }

  return `https://api.football-data.org${path}`;
}

export async function onRequestGet(context) {
  const token = context.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error: 'FOOTBALL_DATA_TOKEN is not configured',
      setup: 'Add FOOTBALL_DATA_TOKEN as a Cloudflare secret/environment variable.',
    }, 503);
  }

  let upstream;
  try {
    upstream = buildUpstreamUrl(context.request);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(upstream, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, cached);
  }

  try {
    const response = await fetch(upstream, {
      headers: {
        'X-Auth-Token': token,
        accept: 'application/json',
      },
    });

    const body = await response.text();
    const headers = {
      'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_TTL}`,
      'access-control-allow-origin': '*',
      'x-kickora-data-source': 'football-data.org',
    };

    if (!response.ok) {
      return new Response(body, { status: response.status, headers });
    }

    const result = new Response(body, { status: 200, headers });
    await cache.put(cacheKey, result.clone());
    return result;
  } catch (error) {
    return json({ ok: false, error: 'Football data provider is temporarily unavailable.' }, 502);
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
