// KICKORA live-only background refresh.
// Match schedules and standings are refreshed by app-v2.js on long intervals;
// this file must not create extra API-Football quota usage every few minutes.
(() => {
  const refreshLive = async () => {
    try { if (typeof loadLive === 'function') await loadLive(); } catch {}
  };
  setInterval(refreshLive, 20 * 60 * 1000);
})();
