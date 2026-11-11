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

  function equalizeLuma(px, strength = 0.5) {  // global histogram equalization on luma, keep hue
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
    const work = src;
    let dx = 0, dy = 0, ds = Math.min(src.width, src.height);
    if (box) { dx = box.x; dy = box.y; ds = box.s; quality.cropped = true; }
    const out = document.createElement('canvas');
    out.width = 128; out.height = 128;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.drawImage(work, dx, dy, ds, ds, 0, 0, 128, 128);
    let q = { data: octx.getImageData(0, 0, 128, 128).data, w: 128, h: 128 };
    const before = [q.data[4], q.data[5], q.data[6]];
    q = equalizeLuma(grayWorld(q));
    const after = [q.data[4], q.data[5], q.data[6]];
    quality.adjusted = before.some((v, i) => Math.abs(v - after[i]) > 2);
    octx.putImageData(new ImageData(q.data, 128, 128), 0, 0);
    return { canvas: out, quality };
  }

  function otsuCut(hist, total) {  // classic Otsu threshold on 0..255 histogram
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, bestV = -1;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const v = (sumB / wB - (sum - sumB) / wF) ** 2 * wB * wF;
      if (v > bestV) { bestV = v; best = t; }
    }
    return best;
  }

  function open3(bin, w, h) {  // 3x3 morphological open: drops speckle noise
    const er = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 1;
      for (let dy = -1; dy <= 1 && m; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !bin[yy * w + xx]) { m = 0; break; }
      }
      er[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1 && !m; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && er[yy * w + xx]) { m = 1; break; }
      }
      out[y * w + x] = m;
    }
    return out;
  }

  // Single-leaf segmentation for plant-in-the-wild shots: excess-green + Otsu,
  // hole-fill (diseased brown patches must not punch holes), connected
  // components scored by size x centrality. Returns per-pixel labels so a tap
  // can reselect the subject leaf.
  function segmentLeaf(px) {
    const { data, w, h } = px, n = w * h;
    const hist = new Uint32Array(256), exg = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      exg[p] = Math.max(0, Math.min(255, 2 * data[i + 1] - data[i] - data[i + 2]));
      hist[exg[p]]++;
    }
    const cut = otsuCut(hist, n);
    let fg = open3(exg.map(v => (v > cut ? 1 : 0)), w, h);
    // fill holes: background reachable from the frame border stays background
    const seen = new Uint8Array(n), q = [];
    for (let x = 0; x < w; x++) { q.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { q.push(y * w, y * w + w - 1); }
    while (q.length) {
      const p = q.pop(), x = p % w, y = (p / w) | 0;
      if (x < 0 || y < 0 || x >= w || y >= h || seen[p] || fg[p]) continue;
      seen[p] = 1;
      q.push(p - 1, p + 1, p - w, p + w);
    }
    for (let p = 0; p < n; p++) if (!fg[p] && !seen[p]) fg[p] = 1; // holes -> leaf
    // connected components (4-neighbourhood) with area + centroid
    const labels = new Int32Array(n).fill(-1);
    const comps = [];
    for (let s = 0; s < n; s++) {
      if (!fg[s] || labels[s] !== -1) continue;
      const id = comps.length, st = [s]; labels[s] = id;
      let area = 0, sx = 0, sy = 0;
      while (st.length) {
        const p = st.pop(), x = p % w, y = (p / w) | 0;
        area++; sx += x; sy += y;
        const nb = [p - 1, p + 1, p - w, p + w];
        for (const m of nb) {
          const mx = m % w, my = (m / w) | 0;
          if (mx < 0 || my < 0 || mx >= w || my >= h || !fg[m] || labels[m] !== -1) continue;
          if (Math.abs(mx - x) + Math.abs(my - y) !== 1) continue;
          labels[m] = id; st.push(m);
        }
      }
      if (area >= n * 0.005) comps.push({ id, area, cx: sx / area, cy: sy / area });
    }
    const cx0 = w / 2, cy0 = h / 2, maxD = Math.hypot(cx0, cy0) || 1;
    let best = -1, bestScore = -1;
    comps.forEach((c, idx) => {
      const areaFrac = c.area / n;
      if (areaFrac < 0.04) return; // speckle, not a subject leaf
      const centrality = 1 - Math.hypot(c.cx - cx0, c.cy - cy0) / maxD;
      const score = 0.65 * Math.min(1, areaFrac / 0.5) + 0.35 * centrality;
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    const coverage = best >= 0 ? comps[best].area / n : 0;
    const runner = comps.reduce((m, c, i) => (i !== best ? Math.max(m, c.area) : m), 0);
    const confident = best >= 0 && coverage >= 0.06 && coverage <= 0.92 &&
      (comps.length === 1 || comps[best].area >= 2 * (runner || 1));
    return { labels, comps, best, coverage, confident, w, h };
  }

  function maskOf(seg, idx) {  // binary mask of one component (default: best)
    const id = idx === undefined || idx < 0 ? seg.best : idx;
    const out = new Uint8Array(seg.w * seg.h);
    if (id < 0) return out;
    const want = seg.comps[id].id;
    for (let p = 0; p < out.length; p++) if (seg.labels[p] === want) out[p] = 1;
    return out;
  }

  function selectComponent(seg, x, y) {  // tap-to-select: component under a point
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= seg.w || y >= seg.h) return -1;
    const id = seg.labels[y * seg.w + x];
    if (id >= 0) return seg.comps.findIndex(c => c.id === id);
    // tapped a lesion, vein or stem gap inside the leaf: take the nearest
    // labeled pixel within a finger-sized radius instead of reporting a miss
    const R = Math.max(24, Math.round(Math.min(seg.w, seg.h) * 0.12));
    for (let r = 1; r <= R; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= seg.w || yy >= seg.h) continue;
          const nid = seg.labels[yy * seg.w + xx];
          if (nid >= 0) return seg.comps.findIndex(c => c.id === nid);
        }
      }
    }
    // still nothing green nearby (big lesion / dead zone): fall back to the
    // nearest leaf by centroid, unless everything is far away (true background)
    let bi = -1, bd = Math.min(seg.w, seg.h) * 0.35;
    seg.comps.forEach((c, i) => {
      const d = Math.hypot(c.cx - x, c.cy - y);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }

  // 128px model input from arbitrary pixels: tight square of the mask bbox on
  // the NATURAL background (this model keys on background texture — never
  // replace it with a flat fill) + the usual light leveling.
  // Returns raw + normalized views plus the crop rect for display.
  function canvasFromPixels(px, mask) {
    let sx = 0, sy = 0, side = Math.min(px.w, px.h);
    if (mask) {
      let x0 = px.w, y0 = px.h, x1 = -1, y1 = -1;
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (!mask[y * px.w + x]) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 >= 0) {
        const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 2;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        x1 = Math.min(px.w - 1, x1 + pad); y1 = Math.min(px.h - 1, y1 + pad);
        side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
        const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
        sx = Math.max(0, Math.min(px.w - side, Math.round(cx - side / 2)));
        sy = Math.max(0, Math.min(px.h - side, Math.round(cy - side / 2)));
        side = Math.min(side, px.w - sx, px.h - sy);
      }
    }
    const src = document.createElement('canvas');
    src.width = px.w; src.height = px.h;
    src.getContext('2d').putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
    const raw = document.createElement('canvas');
    raw.width = 128; raw.height = 128;
    raw.getContext('2d').drawImage(src, sx, sy, side, side, 0, 0, 128, 128);
    const norm = document.createElement('canvas');
    norm.width = 128; norm.height = 128;
    const nctx = norm.getContext('2d', { willReadFrequently: true });
    nctx.drawImage(raw, 0, 0);
    let q = { data: nctx.getImageData(0, 0, 128, 128).data, w: 128, h: 128 };
    const before = [q.data[4], q.data[5], q.data[6]];
    q = equalizeLuma(grayWorld(q));
    const after = [q.data[4], q.data[5], q.data[6]];
    const adjusted = before.some((v, i) => Math.abs(v - after[i]) > 2);
    nctx.putImageData(new ImageData(q.data, 128, 128), 0, 0);
    return { raw, norm, adjusted, rect: { sx, sy, side } };
  }
  root.LeafPre = { SHARP_MIN, GLARE_MAX, excessGreenBBox, grayWorld, equalizeLuma, sharpness, glare, preprocessFromImage,
    otsuCut, segmentLeaf, maskOf, selectComponent, canvasFromPixels };
})(typeof window !== 'undefined' ? window : globalThis);
