// KICKORA background refresh: keep public data fresh without a build step.
(() => {
  const refresh = async () => {
    try { if (typeof loadNews === 'function') await loadNews(); } catch {}
    try { if (typeof loadMatches === 'function') { await loadMatches(); if (typeof renderScoreList === 'function') renderScoreList(); } } catch {}
  };
  setInterval(refresh, 5 * 60 * 1000);
})();
