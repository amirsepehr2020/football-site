// KICKORA background refresh: keep public data fresh without a build step.
(() => {
  const refreshStandings = async () => {
    const table = document.querySelector('#standings');
    if (!table) return;

    try {
      const response = await fetch('/api/football?resource=standings&competition=PL', {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const standing = data.standings?.find(item => item.type === 'TOTAL') || data.standings?.[0];
      const rows = standing?.table || [];
      if (!rows.length) return;

      table.innerHTML = '<div class="table-row head"><span>#</span><span>تیم</span><span>بازی</span><span>تفاضل</span><span>امتیاز</span></div>' +
        rows.slice(0, 10).map(row => {
          const team = row.team || {};
          const goalDiff = Number(row.goalDifference || 0);
          const diff = goalDiff > 0 ? `+${goalDiff}` : `${goalDiff}`;
          return `<div class="table-row"><span class="rank">${row.position ?? '-'}</span><strong>${escapeHtml(team.shortName || team.name || 'تیم')}</strong><span>${row.playedGames ?? 0}</span><span>${diff}</span><span>${row.points ?? 0}</span></div>`;
        }).join('') +
        '<div class="loading" data-source-credit>Data provided by football-data.org</div>';
    } catch {
      // The static table from app.js remains visible until the API is configured.
    }
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  const refresh = async () => {
    try { if (typeof loadNews === 'function') await loadNews(); } catch {}
    try {
      if (typeof loadMatches === 'function') {
        await loadMatches();
        if (typeof renderScoreList === 'function') renderScoreList();
      }
    } catch {}
    await refreshStandings();
  };

  refresh();
  setInterval(refresh, 5 * 60 * 1000);
})();
