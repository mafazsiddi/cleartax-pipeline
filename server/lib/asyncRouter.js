import { Router } from 'express';

/**
 * Express 4 does not catch rejections from `async` route handlers: a throw
 * inside one becomes an unhandled rejection, which Node turns into an uncaught
 * exception. Locally that kills the server; on Vercel it aborts the whole
 * lambda invocation, so the client gets a bare 500 (and any sibling requests
 * in flight on that instance die with it) instead of the JSON error the
 * error-handling middleware in app.js would have produced.
 *
 * `asyncRouter()` is a drop-in for `Router()` that wraps every handler so a
 * rejection is forwarded to `next(err)` and lands in that error middleware.
 * Remove this once the app moves to Express 5, which does it natively.
 */

const METHODS = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function wrapHandler(fn) {
  if (Array.isArray(fn)) return fn.map(wrapHandler);
  if (typeof fn !== 'function') return fn;

  // Express identifies error-handling middleware by arity, so preserve it.
  if (fn.length === 4) {
    return function (err, req, res, next) {
      try {
        return Promise.resolve(fn(err, req, res, next)).catch(next);
      } catch (e) {
        return next(e);
      }
    };
  }

  return function (req, res, next) {
    try {
      return Promise.resolve(fn(req, res, next)).catch(next);
    } catch (e) {
      return next(e);
    }
  };
}

export function asyncRouter(options) {
  const router = Router(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map((arg) => wrapHandler(arg)));
  }
  return router;
}
