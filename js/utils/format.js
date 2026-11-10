/* Formatting helpers — UMD (tested in node). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafFormat = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const pct = (p, digits = 1) => (p * 100).toFixed(digits) + '%';
  const dateStr = ts => new Date(ts).toLocaleString();
  const verdictLabel = v => (v === 'healthy' ? 'Healthy' : v === 'diseased' ? 'Diseased' : 'Uncertain');
  return { pct, dateStr, verdictLabel };
});
