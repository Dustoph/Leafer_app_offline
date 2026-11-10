/* Tiny hash router — UMD-safe (DOM touched only inside start/navigate in browser). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafRouter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ROUTES = {
    scan: { page: 'pages/scan.html', title: 'Scan' },
    history: { page: 'pages/history.html', title: 'History' },
    profile: { page: 'pages/profile.html', title: 'Profile' }
  };
  const DEFAULT_ROUTE = 'scan';

  function resolveRoute(hash) {
    const name = String(hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES[name] ? name : DEFAULT_ROUTE;
  }

  // Browser-only: fetch partial into mount, run middlewares, then page init.
  async function navigate(name, deps) {
    const route = ROUTES[name] || ROUTES[DEFAULT_ROUTE];
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.route === name));
    const html = await (await fetch(route.page)).text();
    deps.mount.innerHTML = html;
    const ctx = { route: name, profiles: deps.profiles, modelReady: deps.isModelReady() };
    LeafGuards.runPipeline(ctx, deps.middlewares, () => {});
    deps.pages[name].init(deps, ctx);
    if (location.hash !== '#/' + name) location.hash = '#/' + name;
  }

  function start(deps) {
    const go = () => navigate(resolveRoute(location.hash), deps);
    addEventListener('hashchange', go);
    return go();
  }

  return { ROUTES, DEFAULT_ROUTE, resolveRoute, navigate, start };
});
