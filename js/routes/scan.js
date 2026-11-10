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
    $('analyzeBtn').onclick = analyze;

    async function analyze() {
      if (!currentPhoto) return;
      const btn = $('analyzeBtn');
      if (!deps.isModelReady()) {
        $('status').textContent = 'AI still loading — one moment…';
        return;
      }
      btn.disabled = true;
      $('status').textContent = 'Analyzing on your phone…';
      try {
        const img = await LeafImage.loadImage(currentPhoto);
        const probs = await LeafInfer.predict(deps.model.tfliteModel, img);
        const pred = probs.indexOf(Math.max(...probs));
        const r = LeafLogic.buildResult(pred, probs, deps.model.labels, deps.model.advice);
        renderResult(r);
        deps.history.add({
          image: await LeafImage.makeThumb(currentPhoto),
          code: r.code, crop: r.crop, condition: r.condition,
          healthy: r.healthy, conf: +r.conf.toFixed(4), verdict: r.verdict
        });
        $('status').textContent = '';
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
