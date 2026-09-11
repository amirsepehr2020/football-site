(() => {
  const originalFetch = window.fetch.bind(window);
  const cachePrefix = 'kickora-news-fa-';

  async function translateText(text) {
    const value = String(text || '').trim();
    if (!value || /[\u0600-\u06FF]/.test(value)) return value;
    const key = cachePrefix + value;
    try {
      const cached = localStorage.getItem(key);
      if (cached) return cached;
    } catch {}

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(value.slice(0, 480))}&langpair=en|fa&mt=1`;
      const response = await originalFetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Translation ${response.status}`);
      const data = await response.json();
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated !== value) {
        try { localStorage.setItem(key, translated); } catch {}
        return translated;
      }
    } catch {}
    return value;
  }

  async function translateArticle(article) {
    const [headline, description] = await Promise.all([
      translateText(article.headline || article.title),
      translateText(article.description || article.story)
    ]);
    return { ...article, headline, title: headline, description, story: description };
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (!requestUrl.includes('/news?')) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data.articles) || !data.articles.length) return response;
      data.articles = await Promise.all(data.articles.map(translateArticle));
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch {
      return response;
    }
  };
})();
