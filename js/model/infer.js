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

  async function predict(tfliteModel, img) {
    const t = tf.tidy(() =>
      tf.browser.fromPixels(img).resizeBilinear([128, 128]).toFloat().expandDims(0));
    const raw = await unwrap(tfliteModel.predict(t));
    const probs = Array.from(await raw.data());
    tf.dispose([t, raw]);
    return probs;
  }

  return { unwrap, predict };
})();
