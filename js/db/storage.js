/* Storage backends — UMD (tested in node). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafStorage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function createMemoryStorage() {
    const m = {};
    return {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; }
    };
  }
  function readJSON(storage, key, fallback) {
    try {
      const v = storage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  }
  function writeJSON(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
  }
  return { createMemoryStorage, readJSON, writeJSON };
});
