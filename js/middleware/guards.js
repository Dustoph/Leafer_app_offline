/* Route middlewares — UMD (tested in node). Each: (ctx, next) => result.
   ctx: { route, profiles, modelReady }. Block by returning { blocked: reason }. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeafGuards = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function runPipeline(ctx, middlewares, handler) {
    let i = -1;
    function next() {
      i++;
      if (i < middlewares.length) return middlewares[i](ctx, next);
      return handler(ctx);
    }
    return next();
  }

  function logging(ctx, next) {
    ctx.log = (ctx.log || []).concat(`route:${ctx.route}`);
    return next();
  }

  function profileScope(ctx, next) {
    ctx.profile = ctx.profiles.current();
    return next();
  }

  // Scan works without the model (photo can be picked first); analysis itself
  // checks readiness. This guard only flags, never blocks — guest-first, no walls.
  function modelFlag(ctx, next) {
    ctx.modelPending = !ctx.modelReady;
    return next();
  }

  return { runPipeline, logging, profileScope, modelFlag };
});
