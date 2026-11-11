/* Phone-photo normalization: bring casual camera shots closer to the clean,
   single-leaf lab scans the model trained on. Runtime-agnostic: core math runs
   on plain {data,w,h} pixels (node-testable); only the thin canvas glue needs a browser.
   Steps: leaf auto-crop (excess-green bbox) -> gray-world white balance ->
   gentle luma equalization. Quality gate: blur + glare scores. */
(function (root) {
  const SHARP_MIN = 100;   // Laplacian variance floor (dataset: 250+; heavy blur: <70)
  const GLARE_MAX = 0.02;  // fraction of near-white pixels tolerated before warning

  function excessGreenBBox(px) {
    const { data, w, h } = px;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (g > 40 && (2 * g - r - b) > 24) {
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const cov = n / (w * h);
    if (n === 0 || cov < 0.03 || cov > 0.97) return null; // no clear leaf, or full-frame leaf
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    // square it around the centre so nothing stretches later
    const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
    let sx = Math.round(cx - side / 2), sy = Math.round(cy - side / 2);
    sx = Math.max(0, Math.min(w - side, sx)); sy = Math.max(0, Math.min(h - side, sy));
    return { x: sx, y: sy, s: Math.min(side, w - sx, h - sy) };
  }

  function grayWorld(px) {  // neutralize indoor-bulb / screen color casts
    const { data } = px;
    let sr = 0, sg = 0, sb = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
    const m = (sr + sg + sb) / (3 * n) || 1;
    const kr = m / ((sr / n) || 1), kg = m / ((sg / n) || 1), kb = m / ((sb / n) || 1);
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      out[i] = data[i] * kr; out[i + 1] = data[i + 1] * kg; out[i + 2] = data[i + 2] * kb;
      out[i + 3] = data[i + 3];
    }
    return { data: out, w: px.w, h: px.h };
  }

  function equalizeLuma(px, strength = 0.5) {  // soften harsh shadows / hotspots, keep hue
    const { data, w, h } = px;
    const n = w * h, luma = new Float32Array(n), hist = new Uint32Array(256);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      luma[p] = L; hist[Math.min(255, L | 0)]++;
    }
    const cdf = new Float32Array(256); let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc / n; }
    const out = new Uint8ClampedArray(data.length);
    for (let p = 0; p < n; p++) {
      const i = p * 4, L = luma[p] || 1;
      const target = cdf[Math.min(255, L | 0)] * 255;
      const k = 1 + (target / L - 1) * strength;
      out[i] = data[i] * k; out[i + 1] = data[i + 1] * k; out[i + 2] = data[i + 2] * k;
      out[i + 3] = data[i + 3];
    }
    return { data: out, w, h };
  }

  function sharpness(px) {  // Laplacian variance on small gray (higher = sharper)
    const { data, w, h } = px;
    const sw = 64, sh = Math.max(1, Math.round(h * sw / w));
    const g = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = ((Math.min(h - 1, (y * h / sh) | 0)) * w + Math.min(w - 1, (x * w / sw) | 0)) * 4;
      g[y * sw + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const L = new Float32Array(sw * sh);
    for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
      const c = y * sw + x;
      L[c] = -4 * g[c] + g[c - 1] + g[c + 1] + g[c - sw] + g[c + sw];
    }
    let mean = 0, cnt = 0;
    for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) { mean += L[y * sw + x]; cnt++; }
    mean /= cnt || 1;
    let v = 0;
    for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
      const d = L[y * sw + x] - mean; v += d * d;
    }
    return v / (cnt || 1);
  }

  function glare(px) {  // fraction of specular near-white pixels
    const { data } = px;
    let n = 0; const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) n++;
    }
    return n / total;
  }

  // ---- browser-only thin glue: element -> normalized 128x128 canvas + quality ----
  function preprocessFromImage(img) {
    const src = document.createElement('canvas');
    const s = Math.min(1, 1024 / Math.max(img.width, img.height));
    src.width = Math.max(1, Math.round(img.width * s));
    src.height = Math.max(1, Math.round(img.height * s));
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, src.width, src.height);
    const raw = sctx.getImageData(0, 0, src.width, src.height);
    const px = { data: raw.data, w: src.width, h: src.height };
    const sharp = sharpness(px), gl = glare(px);
    const quality = { sharp, glare: gl, blurry: sharp < SHARP_MIN, glary: gl > GLARE_MAX, cropped: false, adjusted: false };
    const box = excessGreenBBox(px);
    let dx = 0, dy = 0, ds = Math.min(src.width, src.height);
    if (box) { dx = box.x; dy = box.y; ds = box.s; quality.cropped = true; }
    const out = document.createElement('canvas');
    out.width = 128; out.height = 128;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.drawImage(src, dx, dy, ds, ds, 0, 0, 128, 128);
    let q = { data: octx.getImageData(0, 0, 128, 128).data, w: 128, h: 128 };
    const before = [q.data[4], q.data[5], q.data[6]];
    q = equalizeLuma(grayWorld(q));
    const after = [q.data[4], q.data[5], q.data[6]];
    quality.adjusted = before.some((v, i) => Math.abs(v - after[i]) > 2);
    octx.putImageData(new ImageData(q.data, 128, 128), 0, 0);
    return { canvas: out, quality };
  }

  root.LeafPre = { SHARP_MIN, GLARE_MAX, excessGreenBBox, grayWorld, equalizeLuma, sharpness, glare, preprocessFromImage };
})(typeof window !== 'undefined' ? window : globalThis);
