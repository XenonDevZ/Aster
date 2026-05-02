import { html } from "./html.js";
import { isAction } from "./action.js";
import { createRouter } from "./router.js";
import { isDeferred, setDeferredFallback } from "./deferred.js";
import { page } from "./page.js";
import { json, toResponse } from "./response.js";

const HTTP_METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
const DEFAULT_ACTION_BODY_LIMIT = 1_000_000;
const ACTION_CSRF_MODES = new Set(["lax", "strict"]);

function normalizeActionCsrf(mode) {
  if (mode === false) {
    return false;
  }

  return ACTION_CSRF_MODES.has(mode) ? mode : "lax";
}

function normalizeActionBodyLimit(limit) {
  if (limit === false) {
    return false;
  }

  const value = Number(limit ?? DEFAULT_ACTION_BODY_LIMIT);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ACTION_BODY_LIMIT;
}

function originAllowed(origin, url, allowedOrigins) {
  return origin === url.origin || allowedOrigins.has(origin);
}

function actionCsrfError(request, url, mode, allowedOrigins) {
  if (mode === false) {
    return null;
  }

  const origin = request.headers.get("origin");

  if (origin) {
    return originAllowed(origin, url, allowedOrigins) ? null : "Cross-origin action request";
  }

  const referer = request.headers.get("referer");

  if (referer) {
    try {
      return originAllowed(new URL(referer).origin, url, allowedOrigins) ? null : "Cross-origin action request";
    } catch {
      return "Invalid action referer";
    }
  }

  return mode === "strict" ? "Missing action origin" : null;
}

async function readLimitedActionRequest(request, maxBytes) {
  if (maxBytes === false) {
    return { request };
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const size = Number(contentLength);

    if (Number.isFinite(size) && size > maxBytes) {
      return { tooLarge: true, size };
    }
  }

  if (!request.body) {
    return { request };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;

  for (;;) {
    const next = await reader.read();

    if (next.done) {
      break;
    }

    const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
    size += chunk.byteLength;

    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true, size };
    }

    chunks.push(chunk);
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return {
    request: new Request(request.url, {
      method: request.method,
      headers,
      body
    })
  };
}

function routeMethods(route) {
  if (route.methods?.length > 0) {
    return route.methods.map((method) => method.toUpperCase());
  }

  const module = route.module ?? {};
  const exported = HTTP_METHODS.filter((method) => typeof module[method] === "function");

  if (exported.length > 0) {
    return exported;
  }

  return ["GET"];
}

function routeHandler(route, method) {
  const module = route.module ?? {};

  return (
    route.handler ??
    module[method] ??
    (method === "HEAD" ? module.GET : undefined) ??
    module.default
  );
}

function allowedMethodsHeader(route) {
  const methods = new Set(routeMethods(route));

  if (methods.has("GET")) {
    methods.add("HEAD");
  }

  return [...methods].sort().join(", ");
}

async function loadRouteData(context) {
  const loader = context.route.module?.load ?? context.route.load;

  if (typeof loader !== "function") {
    return undefined;
  }

  const data = await loader(context);
  context.data = data;
  await attachLoadingFallbacks(data, context);
  return data;
}

function nearestLoadingBoundary(route) {
  const boundaries = route?.loadingBoundaries ?? [];
  return boundaries.length > 0 ? boundaries[boundaries.length - 1] : null;
}

async function renderLoadingFallback(context) {
  const boundary = nearestLoadingBoundary(context.route);
  const module = boundary?.module ?? {};
  const render = boundary?.render ?? module.default ?? module.Loading ?? module.loading;

  if (typeof render !== "function") {
    return undefined;
  }

  const result = await render({
    context,
    data: context.data,
    request: context.request,
    url: context.url,
    params: context.params ?? {},
    locals: context.locals ?? {}
  });

  return result?.body ?? result;
}

async function attachLoadingFallbacks(value, context, fallbackPromise) {
  if (!value) {
    return;
  }

  if (isDeferred(value)) {
    setDeferredFallback(value, fallbackPromise ?? renderLoadingFallback(context));
    return;
  }

  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => attachLoadingFallbacks(item, context, fallbackPromise)));
    return;
  }

  if (value.constructor === Object) {
    const fallback = fallbackPromise ?? renderLoadingFallback(context);
    await Promise.all(Object.values(value).map((item) => attachLoadingFallbacks(item, context, fallback)));
  }
}

function routeActions(route) {
  if (route.actions?.length > 0) {
    return route.actions;
  }

  const module = route.module ?? {};

  return Object.entries(module)
    .filter(([, value]) => isAction(value))
    .map(([name, ref]) => ({
      id: ref.id,
      name: ref.name ?? name,
      path: ref.path,
      ref,
      route
    }));
}

function createActionRegistry(routes) {
  const actions = new Map();

  for (const route of routes) {
    for (const entry of routeActions(route)) {
      const ref = entry.ref ?? entry;

      if (!entry.id && !ref.id) {
        continue;
      }

      actions.set(entry.id ?? ref.id, {
        ...entry,
        ref,
        route: entry.route ?? route
      });
    }
  }

  return actions;
}

function actionIdFromPathname(pathname) {
  const prefix = "/_aster/action/";

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}

function compose(middleware, leaf) {
  return async function run(context) {
    let index = -1;

    async function dispatch(nextIndex) {
      if (nextIndex <= index) {
        throw new Error("next() called multiple times in middleware.");
      }

      index = nextIndex;
      const fn = middleware[nextIndex] ?? leaf;

      return fn(context, () => dispatch(nextIndex + 1));
    }

    return dispatch(0);
  };
}

function nearestErrorBoundary(route) {
  const boundaries = route?.errorBoundaries ?? [];
  return boundaries.length > 0 ? boundaries[boundaries.length - 1] : null;
}

async function renderErrorBoundary(error, context, document) {
  const boundary = nearestErrorBoundary(context.route);
  const module = boundary?.module ?? {};
  const render = boundary?.render ?? module.default ?? module.Error ?? module.error;

  if (typeof render !== "function") {
    return null;
  }

  const result = await render({
    error,
    context,
    data: context.data,
    request: context.request,
    url: context.url,
    params: context.params ?? {},
    locals: context.locals ?? {}
  });

  const body = result?.body ? result : page(result, {
    title: "Route error",
    status: 500
  });
  const boundaryRoute = {
    ...context.route,
    layouts: [],
    module: {
      meta: module.meta
    }
  };

  return toResponse(body, {
    ...context,
    route: boundaryRoute,
    error,
    document
  });
}

export function createApp(options) {
  const routes = options.routes ?? [];
  const middleware = options.middleware ?? [];
  const router = createRouter(routes);
  const actionRegistry = createActionRegistry(routes);
  const document = options.document;
  const actionCsrf = normalizeActionCsrf(options.actionCsrf);
  const actionBodyLimit = normalizeActionBodyLimit(options.maxActionBodySize);
  const allowedActionOrigins = new Set(options.allowedActionOrigins ?? []);

  async function handleRoute(context) {
    const method = context.request.method.toUpperCase();
    const methods = routeMethods(context.route);

    if (method === "OPTIONS" && !methods.includes("OPTIONS")) {
      return new Response(null, {
        status: 204,
        headers: {
          allow: allowedMethodsHeader(context.route)
        }
      });
    }

    const handler = routeHandler(context.route, method);

    if (!handler || (!methods.includes(method) && !(method === "HEAD" && methods.includes("GET")))) {
      return json(
        {
          error: "Method Not Allowed",
          method,
          allowed: allowedMethodsHeader(context.route)
        },
        {
          status: 405,
          headers: {
            allow: allowedMethodsHeader(context.route)
          }
        }
      );
    }

    context.data = await loadRouteData(context);
    const result = await handler(context);
    const response = await toResponse(result, { ...context, document });

    if (method === "HEAD") {
      return new Response(null, response);
    }

    return response;
  }

  async function handleAction(context) {
    const method = context.request.method.toUpperCase();

    if (method !== "POST") {
      return json(
        {
          error: "Method Not Allowed",
          method,
          allowed: "POST"
        },
        {
          status: 405,
          headers: {
            allow: "POST"
          }
        }
      );
    }

    const csrfError = actionCsrfError(context.request, context.url, actionCsrf, allowedActionOrigins);

    if (csrfError) {
      return json(
        {
          error: "Forbidden",
          reason: csrfError
        },
        { status: 403 }
      );
    }

    const limited = await readLimitedActionRequest(context.request, actionBodyLimit);

    if (limited.tooLarge) {
      return json(
        {
          error: "Payload Too Large",
          limit: actionBodyLimit
        },
        { status: 413 }
      );
    }

    context.request = limited.request;
    const formData = await context.request.formData();
    const result = await context.action.ref.handler({
      ...context,
      formData,
      action: context.action.ref
    });

    return await toResponse(result, { ...context, formData, document });
  }

  const pipeline = compose(middleware, handleRoute);
  const actionPipeline = compose(middleware, handleAction);

  return {
    router,
    routes: router.routes,
    actions: actionRegistry,

    async fetch(request, env = {}, execution = {}) {
      const url = new URL(request.url);
      const actionId = actionIdFromPathname(url.pathname);

      if (actionId) {
        const actionEntry = actionRegistry.get(actionId);

        if (!actionEntry) {
          return json(
            {
              error: "Action Not Found",
              id: actionId
            },
            { status: 404 }
          );
        }

        const context = {
          request,
          url,
          params: {},
          route: actionEntry.route,
          action: actionEntry,
          locals: {},
          env,
          execution
        };

        try {
          return await actionPipeline(context);
        } catch (error) {
          if (options.onError) {
            return await toResponse(await options.onError(error, context), { ...context, document });
          }

          console.error("[aster] unhandled action error", error);
          return json(
            {
              error: "Action error",
              message: error.message
            },
            { status: 500 }
          );
        }
      }

      const match = router.match(url.pathname);

      if (!match) {
        const notFound =
          options.notFound ??
          (() =>
            page(html`<main><h1>Not found</h1><p>No route matched ${url.pathname}.</p></main>`, {
              title: "Not found",
              status: 404
            }));

        return await toResponse(await notFound({ request, url, params: {}, locals: {}, env, execution }), {
          request,
          url,
          env,
          execution,
          document
        });
      }

      const context = {
        request,
        url,
        params: match.params,
        route: match.route,
        locals: {},
        env,
        execution
      };

      try {
        return await pipeline(context);
      } catch (error) {
        const boundaryResponse = await renderErrorBoundary(error, context, document).catch((boundaryError) => {
          console.error("[aster] error boundary failed", boundaryError);
          return null;
        });

        if (boundaryResponse) {
          return boundaryResponse;
        }

        if (options.onError) {
          return await toResponse(await options.onError(error, context), { ...context, document });
        }

        console.error("[aster] unhandled route error", error);
        return await toResponse(
          page(html`<main><h1>Server error</h1><p>${error.message}</p></main>`, {
            title: "Server error",
            status: 500
          }),
          { ...context, document }
        );
      }
    }
  };
}
