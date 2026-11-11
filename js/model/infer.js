/* Inference: image -> 128x128 raw-pixel tensor -> probabilities — browser only.
   The model was trained on raw pixels: no rescaling to unit range here (proven by test). */
window.LeafInfer = (() => {
  async function unwrap(out) {  // predict() may return Tensor or Map
    if (out instanceof Map) return out.values().next().value;
    if (out && typeof out === 'object' && !(out instanceof tf.Tensor)) {
      const v = Object.values(out).find(v => v instanceof tf.Tensor);
      if (v) return v;
    }
    return out;
  }

  function tensorFromCanvas(canvas, view) {
    return tf.tidy(() => {
      let t = tf.browser.fromPixels(canvas).toFloat();
      if (view === 'flip') t = t.reverse(1);
      if (view === 'bright') t = t.mul(1.12).clipByValue(0, 255);
      return t.resizeBilinear([128, 128]).expandDims(0);
    });
  }

  async function predict(tfliteModel, img) {
    // img may be an element (legacy: plain resize) or a preprocessed canvas
    const t = tf.tidy(() => img instanceof HTMLCanvasElement
      ? tf.browser.fromPixels(img).toFloat().expandDims(0)
      : tf.browser.fromPixels(img).resizeBilinear([128, 128]).toFloat().expandDims(0));
    const raw = await unwrap(tfliteModel.predict(t));
    const probs = Array.from(await raw.data());
    tf.dispose([t, raw]);
    return probs;
  }

  // Test-time augmentation: average original + mirror. Orientation-only views:
  // flips preserve the color balance this model is sensitive to, unlike brightness shifts.
  // Smooths orientation quirks of casual phone shots without denting clean uploads.
  async function predictAvg(tfliteModel, canvas) {
    const views = ['orig', 'flip'];
    const acc = new Array(38).fill(0);
    for (const v of views) {
      const t = tensorFromCanvas(canvas, v);
      const raw = await unwrap(tfliteModel.predict(t));
      const p = Array.from(await raw.data());
      tf.dispose([t, raw]);
      for (let i = 0; i < 38; i++) acc[i] += p[i] / views.length;
    }
    return acc;
  }

  return { unwrap, predict, predictAvg };
})();
