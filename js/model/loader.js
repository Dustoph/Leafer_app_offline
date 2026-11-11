/* Model loading: plain TensorFlow.js graph model (no Emscripten probe, no dual
   instance race — model.json + shards load as ordinary fetches). Browser only. */
window.LeafLoader = (() => {
  async function load({ modelUrl, labelsUrl, adviceUrl, onStep }) {
    const say = onStep || (() => {});
    say('loading labels…');
    const [labels, advice] = await Promise.all([
      fetch(labelsUrl).then(r => { if (!r.ok) throw new Error('labels missing'); return r.json(); }),
      fetch(adviceUrl).then(r => { if (!r.ok) throw new Error('advice missing'); return r.json(); })
    ]);
    if (!Array.isArray(labels) || labels.length !== 38) throw new Error('expected 38 labels, got ' + (labels && labels.length));
    say('loading plant model…');
    const waits = [2000, 5000, 10000, 20000];
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        if (attempt > 1) say(`still downloading… (attempt ${attempt}/5 — keep this page open)`);
        const graphModel = await tf.loadGraphModel(modelUrl);
        if (!graphModel) throw new Error('model failed to load');
        // warmup so the first real scan is fast
        const z = tf.zeros([1, 128, 128, 3], 'float32');
        const out = graphModel.execute(z);
        tf.dispose(Array.isArray(out) ? out.concat([z]) : [out, z]);
        return { graphModel, labels, advice };
      } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, waits[attempt - 1] || 20000)); }
    }
    throw lastErr;
  }

  return { load };
})();
