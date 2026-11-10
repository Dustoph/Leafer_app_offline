/* Scan history, namespaced per profile — UMD (tested in node). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafHistory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_RECORDS = 100;
  const keyFor = pid => `leafcare.history.${pid}`;

  function createHistoryStore(storage, getPid) {
    const read = (k, fb) => {
      try { const v = storage.getItem(k); return v == null ? fb : JSON.parse(v); }
      catch { return fb; }
    };
    const write = (k, v) => storage.setItem(k, JSON.stringify(v));
    return {
      MAX_RECORDS, keyFor,
      add(rec) {
        const pid = getPid();
        const all = read(keyFor(pid), []);
        all.unshift({ id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), ts: Date.now(), profileId: pid, ...rec });
        write(keyFor(pid), all.slice(0, MAX_RECORDS));
        return all[0];
      },
      list: () => read(keyFor(getPid()), []),
      listOf: pid => read(keyFor(pid), []),
      remove(id) {
        const pid = getPid();
        write(keyFor(pid), read(keyFor(pid), []).filter(r => r.id !== id));
      }
    };
  }
  return { createHistoryStore, MAX_RECORDS, keyFor };
});
