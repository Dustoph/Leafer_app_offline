/* Profile page controller — optional local profiles. Browser only. */
window.LeafPages = window.LeafPages || {};
window.LeafPages.profile = (() => {
  function init(deps) {
    const { $, esc } = LeafDOM;
    const me = deps.profiles.current();
    const all = deps.profiles.list();
    const box = $('profileArea');
    box.innerHTML = `<div class="card"><b>Using LeafCare as: ${esc(me.name)}</b>
      <div class="muted">${all.length - 1} extra profile(s) · each keeps its own history</div></div>`;
    for (const p of all) {
      if (p.id === me.id) continue;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span style="flex:1">👤 ${esc(p.name)} <span class="muted">(${deps.history.listOf(p.id).length} scans)</span></span>`;
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = 'Switch';
      b.onclick = () => { deps.profiles.switch(p.id); init(deps); };
      row.appendChild(b);
      box.appendChild(row);
    }
    $('newProfileForm').onsubmit = e => {
      e.preventDefault();
      try {
        deps.profiles.create($('profileName').value);
        $('profileName').value = '';
        init(deps);
      } catch {
        alert('Please type a new, unused name.');
      }
    };
  }
  return { init };
})();
