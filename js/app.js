/* LeafCare bootstrap — wires db + model + router. Browser only. No signup walls: guest-first. */
(() => {
  const profiles = LeafProfiles.createProfileStore(localStorage);
  const history = LeafHistory.createHistoryStore(localStorage, () => profiles.current().id);
  const model = { graphModel: null, labels: null, advice: null };
  const isModelReady = () => !!model.graphModel;

  let bootPromise = null;
  function bootModel() {
    if (!bootPromise) {
      const badge = document.getElementById('modelBadge');
      bootPromise = LeafLoader.load({
        modelUrl: 'model/tfjs/model.json',
        labelsUrl: 'data/labels.json', adviceUrl: 'data/advice.json',
        onStep: s => { badge.textContent = s; }
      }).then(m => {
        Object.assign(model, m);
        badge.textContent = '● on-device AI ready';
        return m;
      }).catch(err => {
        bootPromise = null; // allow a later tap to retry
        badge.textContent = 'AI unavailable — tap 🔍 to retry';
        badge.title = String((err && err.message) || err);
        console.error(err);
        throw err;
      });
    }
    return bootPromise;
  }

  const deps = {
    mount: document.getElementById('app'),
    profiles, history, model, isModelReady, bootModel,
    middlewares: [LeafGuards.logging, LeafGuards.profileScope, LeafGuards.modelFlag],
    pages: { scan: LeafPages.scan, history: LeafPages.history, profile: LeafPages.profile }
  };

  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => LeafRouter.navigate(b.dataset.route, deps));
  });

  // background boot of the on-device model (Analyze also triggers it on demand)
  bootModel().catch(() => {
    const st = document.getElementById('status');
    if (st) st.textContent = 'Model download failed — check connection, then tap 🔍 Analyze to retry.';
  });

  LeafRouter.start(deps);
})();
