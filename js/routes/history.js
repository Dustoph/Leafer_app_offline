/* History page controller — per-profile scan list. Browser only. */
window.LeafPages = window.LeafPages || {};
window.LeafPages.history = (() => {
  function init(deps) {
    const { $, esc } = LeafDOM;
    const me = deps.profiles.current();
    $('histScope').textContent = `Showing history for “${me.name}” on this phone.`;
    const listEl = $('historyList');
    listEl.innerHTML = '';
    const list = deps.history.list();
    if (!list.length) {
      listEl.innerHTML = `<div class="empty">No scans yet.<br>Take a leaf photo to start.</div>`;
      return;
    }
    for (const r of list) {
      const d = document.createElement('div');
      d.className = 'card hist';
      d.innerHTML = `<img src="${r.image}" alt=""><div class="meta"><b>${esc(r.crop)} — ${esc(r.condition)}</b>
        <span class="${r.verdict === 'healthy' ? 'ok' : 'no'}">${esc(LeafFormat.verdictLabel(r.verdict))}</span>
        <span class="muted"> · ${LeafFormat.pct(r.conf, 0)} · ${esc(LeafFormat.dateStr(r.ts))}</span></div>`;
      const del = document.createElement('button');
      del.className = 'btn small'; del.textContent = 'Delete';
      del.onclick = () => { deps.history.remove(r.id); init(deps); };
      d.appendChild(del);
      listEl.appendChild(d);
    }
  }
  return { init };
})();
