/* LeafCare bootstrap — wires db + model + router. Browser only. No signup walls: guest-first. */
(() => {
  const profiles = LeafProfiles.createProfileStore(localStorage);
  const history = LeafHistory.createHistoryStore(localStorage, () => profiles.current().id);
  const model = { tfliteModel: null, labels: null, advice: null };
  const isModelReady = () => !!model.tfliteModel;

  const deps = {
    mount: document.getElementById('app'),
    profiles, history, model, isModelReady,
    middlewares: [LeafGuards.logging, LeafGuards.profileScope, LeafGuards.modelFlag],
    pages: { scan: LeafPages.scan, history: LeafPages.history, profile: LeafPages.profile }
  };

  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => LeafRouter.navigate(b.dataset.route, deps));
  });

  // silent background boot of the on-device model
  const badge = document.getElementById('modelBadge');
  LeafLoader.load({
   modelUrl: 'model/tfjs/model.json',
    labelsUrl: 'data/labels.json', adviceUrl: 'data/advice.json',
    onStep: s => { badge.textContent = s; }
  }).then(m => {
    Object.assign(model, m);
    badge.textContent = '● on-device AI ready';
  }).catch(err => {
    badge.textContent = 'AI unavailable';
    badge.title = String((err && err.message) || err);
    const st = document.getElementById('status');
    if (st) st.textContent = 'Model failed to load: ' + badge.title;
    console.error(err);
  });

  LeafRouter.start(deps);
})();
