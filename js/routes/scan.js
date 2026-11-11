/* Scan page controller — photo pick, on-device analysis, result card. Browser only. */
window.LeafPages = window.LeafPages || {};
window.LeafPages.scan = (() => {
  let currentPhoto = null;

  function init(deps) {
    const { $, esc } = LeafDOM;
    currentPhoto = null;

    const pick = file => {
      if (!file) return;
      LeafImage.fileToDataURL(file).then(url => {
        currentPhoto = url;
        $('preview').src = currentPhoto;
        $('preview').classList.remove('hidden');
        $('dropHint').classList.add('hidden');
        $('analyzeBtn').disabled = false;
        $('resultCard').classList.add('hidden');
      });
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
      if (!currentPhoto) return;
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
      $('status').textContent = 'Adjusting photo to lab conditions…';
      {
        const img = await LeafImage.loadImage(currentPhoto);
        // normalize the phone shot, then gate on capture quality
        const { canvas, quality } = LeafPre.preprocessFromImage(img);
        if (quality.blurry) {
          $('status').textContent = `Photo looks blurry (sharpness ${quality.sharp.toFixed(0)} < ${LeafPre.SHARP_MIN}) — hold steady, tap to focus, and retake.`;
          btn.disabled = false;
          return;
        }
        $('status').textContent = 'Analyzing on your phone…';
        // two reads, disagreement protocol: the plain resize and the normalized
        // crop vote independently; a confident agreement wins, a split with no
        // confident winner is reported unsure instead of a guess.
        const plainProbs = await LeafInfer.predict(deps.model.graphModel, img);
        const normProbs = await LeafInfer.predictAvg(deps.model.graphModel, canvas);
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
        if (quality.glary) r.note = (r.note ? r.note + ' ' : '') + '⚠️ Glare spotted — result less certain, try shade.';
        else if (quality.adjusted || quality.cropped) r.note = (r.note ? r.note + ' ' : '') + '✨ Auto-adjusted framing/lighting.';
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
