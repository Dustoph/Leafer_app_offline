/* Verdict logic — UMD (tested in node). No DOM, no storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const INPUT_SIZE = 128;
  const LOW_CONF = 0.6;

  function topK(probs, k) {
    return probs
      .map((p, i) => ({ i, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, k);
  }

  // label: {code, crop, condition, healthy}; advice keyed by code
  function buildResult(predIdx, probs, labels, advice) {
    const label = labels[predIdx];
    const info = (advice && advice[label.code]) || { status: label.healthy ? 'healthy' : 'diseased', title: label.condition, tip: '' };
    const conf = probs[predIdx];
    let verdict = label.healthy ? 'healthy' : 'diseased';
    let note = '';
    if (conf < LOW_CONF) {
      verdict = 'unsure';
      note = 'Low confidence — retake in daylight with one leaf filling the frame.';
    }
    return {
      code: label.code, crop: label.crop, condition: info.title,
      healthy: label.healthy, conf, verdict, note, tip: info.tip,
      top3: topK(Array.from(probs), 3).map(t => ({
        code: labels[t.i].code, title: (advice[labels[t.i].code] || {}).title || labels[t.i].condition, p: t.p
      }))
    };
  }

  return { INPUT_SIZE, LOW_CONF, topK, buildResult };
});
