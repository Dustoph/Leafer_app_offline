/* Scan page controller — photo pick, on-device analysis, result card. Browser only. */
window.LeafPages = window.LeafPages || {};
window.LeafPages.scan = (() => {
  let currentPhoto = null;

  function init(deps) {
    const { $, esc } = LeafDOM;
    currentPhoto = null;

    let sel = null;            // { px, seg, comp, views:{raw,norm}, adjusted }

    function pxFromImage(img) {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, c.width, c.height);
      return { data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    }

    function fullCanvas() {  // full-res canvas of the picked photo
      const c = document.createElement('canvas');
      c.width = sel.px.w; c.height = sel.px.h;
      c.getContext('2d').putImageData(new ImageData(sel.px.data, sel.px.w, sel.px.h), 0, 0);
      return c;
    }

    function showComposite() {
      // natural-pixel crop of the subject leaf's bbox — the model's read
      // depends on real background texture, so the backdrop is never faked
      const views = LeafPre.canvasFromPixels(sel.px, LeafPre.maskOf(sel.seg, sel.comp));
      sel.views = views; sel.adjusted = views.adjusted;
      const { sx, sy, side } = views.rect;
      const ds = Math.min(side, 640), dc = document.createElement('canvas');
      dc.width = ds; dc.height = ds;
      dc.getContext('2d').drawImage(fullCanvas(), sx, sy, side, side, 0, 0, ds, ds);
      $('preview').src = dc.toDataURL('image/jpeg', 0.85);
      $('preview').classList.remove('hidden');
      $('dropHint').classList.add('hidden');
    }

    const pick = file => {
      if (!file) return;
      LeafImage.fileToDataURL(file).then(async url => {
        currentPhoto = url; sel = null;
        $('resultCard').classList.add('hidden');
        $('leafConfirm').classList.add('hidden');
        const img = await LeafImage.loadImage(url);
        const px = pxFromImage(img);
        // capture-quality gate on the raw shot first
        const sharp = LeafPre.sharpness(px);
        if (sharp < LeafPre.SHARP_MIN) {
          $('status').textContent = `Photo looks blurry (sharpness ${sharp.toFixed(0)} < ${LeafPre.SHARP_MIN}) — hold steady, tap to focus, and retake.`;
          $('preview').src = url; $('preview').classList.remove('hidden');
          $('dropHint').classList.add('hidden');
          return;
        }
        // isolate the subject leaf from its background
        const seg = LeafPre.segmentLeaf(px);
        sel = { px, seg, comp: seg.best, glary: LeafPre.glare(px) > LeafPre.GLARE_MAX };
        if (seg.best < 0 || seg.coverage < 0.06) {
          // no separable leaf, or only fragments (macro close-up): cropping a
          // fragment is worse than the whole frame — analyze as-is.
          $('status').textContent = 'One leaf fills the frame — analyzing as-is.';
          sel.comp = -1;
          sel.views = LeafPre.canvasFromPixels(px, null);
          sel.adjusted = sel.views.adjusted;
          const { sx, sy, side } = sel.views.rect;
          const ds = Math.min(side, 640), dc = document.createElement('canvas');
          dc.width = ds; dc.height = ds;
          dc.getContext('2d').drawImage(fullCanvas(), sx, sy, side, side, 0, 0, ds, ds);
          $('preview').src = dc.toDataURL('image/jpeg', 0.85);
          $('preview').classList.remove('hidden');
          $('dropHint').classList.add('hidden');
        } else {
          showComposite();
          const n = seg.comps.length;
          $('tapHint').textContent = seg.confident
            ? '🌿 Leaf isolated — tap 🔍 to analyze, or tap the photo if we picked the wrong leaf.'
            : `🌿 Found ${n} leafy regions — tap YOUR leaf in the photo, then 🔍.`;
          $('leafConfirm').classList.remove('hidden');
        }
        $('analyzeBtn').disabled = false;
      });
    };

    // tap-to-select: reselect the subject leaf when auto-pick is wrong
    $('preview').onclick = e => {
      if (!sel || !sel.seg || !sel.px) return;
      const r = $('preview').getBoundingClientRect();
      // preview shows the mask-bbox square: map back through the same crop
      const mask = LeafPre.maskOf(sel.seg, sel.comp >= 0 ? sel.comp : sel.seg.best);
      let x0 = sel.px.w, y0 = sel.px.h, x1 = -1, y1 = -1;
      for (let y = 0; y < sel.px.h; y++) for (let x = 0; x < sel.px.w; x++) {
        if (!mask[y * sel.px.w + x]) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) return;
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 2;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
      const side = Math.min(Math.max(x1 - x0 + 1, y1 - y0 + 1),
        sel.px.w - x0, sel.px.h - y0);
      const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      const sx = Math.max(0, Math.min(sel.px.w - side, Math.round(cx - side / 2)));
      const sy = Math.max(0, Math.min(sel.px.h - side, Math.round(cy - side / 2)));
      const ix = Math.round(sx + (e.clientX - r.left) / r.width * side);
      const iy = Math.round(sy + (e.clientY - r.top) / r.height * side);
      const hit = LeafPre.selectComponent(sel.seg, ix, iy);
      if (hit >= 0 && hit !== sel.comp) {
        sel.comp = hit;
        showComposite();
        $('tapHint').textContent = '🌿 Selected this leaf — tap 🔍 to analyze.';
      } else if (hit < 0) {
        $('tapHint').textContent = '👆 No leaf there — tap directly on a leaf.';
      }
    };

    $('retakeBtn').onclick = () => {
      currentPhoto = null; sel = null;
      $('preview').classList.add('hidden'); $('preview').removeAttribute('src');
      $('dropHint').classList.remove('hidden');
      $('leafConfirm').classList.add('hidden');
      $('resultCard').classList.add('hidden');
      $('analyzeBtn').disabled = true;
      $('status').textContent = '';
    };
    $('camInput').onchange = e => pick(e.target.files[0]);
    $('photoInput').onchange = e => pick(e.target.files[0]);
    // drag & drop onto the preview frame (desktop + mobile browsers that allow it)
    const zone = $('dropZone');
    if (zone) {
      ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
        e.preventDefault();
        zone.classList.add('dropZoneDrag');
      }));
      ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
        e.preventDefault();
        zone.classList.remove('dropZoneDrag');
      }));
      zone.addEventListener('drop', e => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && (f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name))) pick(f);
        else $('status').textContent = 'That drop did not contain an image — try a JPG or PNG leaf photo.';
      });
    }
    $('analyzeBtn').onclick = analyze;

    async function analyze() {
      if (!sel || !sel.views) return;
      const btn = $('analyzeBtn');
      btn.disabled = true;
      try {
        if (!deps.isModelReady()) {
          $('status').textContent = 'First run: downloading the on-device brain (~15 MB, once) — keep this page open…';
          try { await deps.bootModel(); }
          catch (e) {
            $('status').textContent = 'Download failed (' + (e.message || 'network') + ') — check connection and tap 🔍 again.';
            btn.disabled = false;
            return;
          }
        }
      $('status').textContent = 'Analyzing on your phone…';
      {
        // two reads, disagreement protocol: the plain composite and the
        // light-normalized composite vote independently; a confident agreement
        // wins, a split with no confident winner is reported unsure.
        const plainProbs = await LeafInfer.predict(deps.model.graphModel, sel.views.raw);
        const normProbs = await LeafInfer.predictAvg(deps.model.graphModel, sel.views.norm);
        const topOf = p => p.indexOf(Math.max(...p));
        const pTop = topOf(plainProbs), nTop = topOf(normProbs);
        const pConf = plainProbs[pTop], nConf = normProbs[nTop];
        let probs, agreeNote = '';
        if (pTop === nTop) {
          probs = plainProbs.map((p, i) => Math.max(p, normProbs[i]));
        } else if (Math.max(pConf, nConf) >= 0.85) {
          probs = pConf >= nConf ? plainProbs : normProbs;
          agreeNote = '⚠️ Two framings disagreed — showing the confident read.';
        } else {
          probs = pConf >= nConf ? plainProbs : normProbs;
          // force honest uncertainty: cap confidence below the verdict threshold
          probs = probs.map((p, i) => (i === (pConf >= nConf ? pTop : nTop) ? 0.55 : p * 0.4));
          agreeNote = '⚠️ Conflicting reads — angle or light may be off; retake straight-on in daylight.';
        }
        const pred = topOf(probs);
        const r = LeafLogic.buildResult(pred, probs, deps.model.labels, deps.model.advice);
        if (agreeNote) r.note = (r.note ? r.note + ' ' : '') + agreeNote;
        if (sel.glary) r.note = (r.note ? r.note + ' ' : '') + '⚠️ Glare spotted — result less certain, try shade.';
        else r.note = (r.note ? r.note + ' ' : '') + '✨ Subject leaf isolated from background foliage.';
        renderResult(r);
        deps.history.add({
          image: await LeafImage.makeThumb(currentPhoto),
          code: r.code, crop: r.crop, condition: r.condition,
          healthy: r.healthy, conf: +r.conf.toFixed(4), verdict: r.verdict
        });
        $('status').textContent = '';
        }
      } catch (e) {
        $('status').textContent = 'Analysis failed: ' + e.message;
      }
      btn.disabled = false;
    }

    function renderResult(r) {
      const card = $('resultCard');
      card.classList.remove('hidden', 'sick', 'unsure');
      if (r.verdict === 'diseased') card.classList.add('sick');
      if (r.verdict === 'unsure') card.classList.add('unsure');
      const head = r.verdict === 'healthy' ? '✅ Healthy leaf'
        : r.verdict === 'diseased' ? '🦠 Diseased leaf' : '❓ Uncertain';
      card.innerHTML = `<h2>${head}</h2>
        <div><b>${esc(r.crop)} — ${esc(r.condition)}</b></div>
        <div class="conf">${LeafFormat.pct(r.conf)}</div>
        ${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}
        ${r.tip ? `<div class="tip">💡 ${esc(r.tip)}</div>` : ''}
        <div class="muted" style="margin-top:.5rem">Also considered: ${r.top3.slice(1).map(t => `${esc(t.title)} (${LeafFormat.pct(t.p, 0)})`).join(' · ')}</div>`;
    }
  }

  return { init };
})();
