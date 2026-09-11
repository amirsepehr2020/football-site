// KICKORA background refresh: refresh the same cached API layer used by the main app.
(() => {
  const refresh = async () => {
    try { if (typeof loadNews === 'function') await loadNews(); } catch {}
    try { if (typeof loadMatches === 'function') await loadMatches(); } catch {}
    try { if (typeof loadStandings === 'function') await loadStandings(); } catch {}
  };

  // app-v2.js performs the first load. This interval keeps the UI fresh afterwards.
  setInterval(refresh, 5 * 60 * 1000);
})();
