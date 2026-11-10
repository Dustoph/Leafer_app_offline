/* Model loading: vendored tfjs-tflite runtime + proven .tflite bytes — browser only. */
window.LeafLoader = (() => {
  function wasmBaseDir(base) {
    // setWasmPath takes a DIRECTORY PREFIX: the runtime appends
    // "tflite_web_api_cc{,_simd}.js" itself and auto-picks simd vs plain.
    return base.endsWith('/') ? base : base + '/';
  }

  async function load({ wasmBase, modelUrl, labelsUrl, adviceUrl, onStep }) {
    const say = onStep || (() => {});
    say('loading labels…');
    const [labels, advice] = await Promise.all([
      fetch(labelsUrl).then(r => { if (!r.ok) throw new Error('labels missing'); return r.json(); }),
      fetch(adviceUrl).then(r => { if (!r.ok) throw new Error('advice missing'); return r.json(); })
    ]);
    if (!Array.isArray(labels) || labels.length !== 38) throw new Error('expected 38 labels, got ' + (labels && labels.length));
    // NOTE: wasmBase MUST equal the runtime's own probe directory (the folder
    // containing tf-tflite.min.js). The probe and the real load then share one
    // URL, one cached copy, one module global — no mid-init overwrite races.
    say('loading AI runtime…');
    tflite.setWasmPath(wasmBaseDir(wasmBase));
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        say(attempt > 1 ? `loading plant model… (retry ${attempt})` : 'loading plant model…');
        const tfliteModel = await tflite.loadTFLiteModel(modelUrl);
        if (!tfliteModel) throw new Error('model failed to load');
        // warmup so the first real scan is fast
        const z = tf.zeros([1, 128, 128, 3], 'float32');
        tf.dispose(await LeafInfer.unwrap(tfliteModel.predict(z)));
        z.dispose();
        return { tfliteModel, labels, advice };
      } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
    }
    throw lastErr;
  }

  return { load };
})();
