/* Profiles (optional local accounts) — UMD (tested in node). Depends on LeafStorage shape. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafProfiles = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const K_PROFILES = 'leafcare.profiles';
  const K_CURRENT = 'leafcare.current';
  const GUEST = 'guest';

  function createProfileStore(storage, io) {
    io = io || {
      read: (k, fb) => {
        try { const v = storage.getItem(k); return v == null ? fb : JSON.parse(v); }
        catch { return fb; }
      },
      write: (k, v) => storage.setItem(k, JSON.stringify(v))
    };
    if (!io.read(K_PROFILES, null)) io.write(K_PROFILES, [{ id: GUEST, name: 'Guest', ts: Date.now() }]);
    if (!io.read(K_CURRENT, null)) io.write(K_CURRENT, GUEST);
    return {
      GUEST, K_PROFILES, K_CURRENT,
      list: () => io.read(K_PROFILES, []),
      create(name) {
        name = String(name || '').trim().slice(0, 24);
        if (!name) throw new Error('empty-name');
        const ps = io.read(K_PROFILES, []);
        if (ps.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate-name');
        const p = { id: 'p' + Date.now().toString(36), name, ts: Date.now() };
        ps.push(p); io.write(K_PROFILES, ps); io.write(K_CURRENT, p.id);
        return p;
      },
      switch(id) {
        if (!io.read(K_PROFILES, []).some(p => p.id === id)) throw new Error('unknown-profile');
        io.write(K_CURRENT, id);
      },
      current() {
        const id = io.read(K_CURRENT, GUEST);
        return io.read(K_PROFILES, []).find(p => p.id === id) || { id: GUEST, name: 'Guest' };
      }
    };
  }
  return { createProfileStore, K_PROFILES, K_CURRENT, GUEST };
});
