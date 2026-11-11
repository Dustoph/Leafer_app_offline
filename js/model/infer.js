/* Inference: image -> 128x128 raw-pixel tensor -> probabilities — browser only.
   The model was trained on raw pixels: no rescaling to unit range here (proven by test). */
window.LeafInfer = (() => {
  async function unwrap(out) {  // execute() may return Tensor, Tensor[], or Map
    if (Array.isArray(out)) return out[0];
    if (out instanceof Map) return out.values().next().value;
    if (out && typeof out === 'object' && !(out instanceof tf.Tensor)) {
      const v = Object.values(out).find(v => v instanceof tf.Tensor);
      if (v) return v;
    }
    return out;
  }

  async function runModel(graphModel, t) {
    const raw = await unwrap(graphModel.execute(t));
    const probs = Array.from(await raw.data());
    tf.dispose([t, raw]);
    return probs;
  }

  function tensorFromCanvas(canvas, view) {
    return tf.tidy(() => {
      let t = tf.browser.fromPixels(canvas).toFloat();
      if (view === 'flip') t = t.reverse(1);
      return t.resizeBilinear([128, 128]).expandDims(0);
    });
  }

  async function predict(graphModel, img) {
    // img may be an element (legacy: plain resize) or a preprocessed canvas
    const t = tf.tidy(() => img instanceof HTMLCanvasElement
      ? tf.browser.fromPixels(img).toFloat().expandDims(0)
      : tf.browser.fromPixels(img).resizeBilinear([128, 128]).toFloat().expandDims(0));
    return runModel(graphModel, t);
  }

  function rotateCanvas(canvas, turns) {  // exact 90° steps, no border artifacts
    if (turns % 4 === 0) return canvas;
    const c = document.createElement('canvas');
    c.width = canvas.height; c.height = canvas.width;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2);
    x.rotate((turns % 4) * Math.PI / 2);
    x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  // Test-time augmentation, conditional: base vote (original + mirror) wins whenever
  // it is confident, so clean uploads behave exactly as before. Quarter-turn views
  // run only when the base vote is uncertain (sideways-held phone) — and a rotated
  // view may only confirm the base vote's leading class, never invent a new
  // confident answer (a rotated tomato leaf can look like an apple leaf).
  async function predictAvg(graphModel, canvas) {
    const base = await runModel(graphModel, tensorFromCanvas(canvas, 'orig'));
    const flip = await runModel(graphModel, tensorFromCanvas(canvas, 'flip'));
    const acc = base.map((p, i) => (p + flip[i]) / 2);
    if (Math.max(...acc) >= 0.6) return acc;
    const topCls = acc.indexOf(Math.max(...acc));
    let best = acc, bestConf = Math.max(...acc);
    for (const turns of [1, 3]) {
      const p = await runModel(graphModel, tensorFromCanvas(rotateCanvas(canvas, turns), 'orig'));
      if (p.indexOf(Math.max(...p)) === topCls && Math.max(...p) > bestConf) {
        best = p; bestConf = Math.max(...p);
      }
    }
    return best;
  }

  return { unwrap, predict, predictAvg };
})();
