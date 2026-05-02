import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { createApp, json } from "../../aster-core/src/index.js";
import { createRouteManifest } from "../../aster-compiler/src/index.js";
import { createLiveReloadHub, injectLiveReload, watchProject } from "./live-reload.js";
import { serveFrameworkAsset, servePublicAsset } from "./static.js";

function headersFromNode(request) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function toFetchRequest(request, port) {
  const host = request.headers.host ?? `localhost:${port}`;
  const url = new URL(request.url ?? "/", `http://${host}`);
  const method = request.method ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method.toUpperCase());

  return new Request(url, {
    method,
    headers: headersFromNode(request),
    body: hasBody ? Readable.toWeb(request) : undefined,
    duplex: hasBody ? "half" : undefined
  });
}

async function sendFetchResponse(nodeResponse, fetchResponse) {
  nodeResponse.statusCode = fetchResponse.status;
  nodeResponse.statusMessage = fetchResponse.statusText;

  fetchResponse.headers.forEach((value, name) => {
    nodeResponse.setHeader(name, value);
  });

  if (!fetchResponse.body) {
    nodeResponse.end();
    return;
  }

  for await (const chunk of Readable.fromWeb(fetchResponse.body)) {
    nodeResponse.write(chunk);
  }

  nodeResponse.end();
}

export async function createDevHandler(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const liveReload = options.liveReload ?? createLiveReloadHub();
  const middleware = options.middleware ?? [
    async (context, next) => {
      const started = performance.now();
      const response = await next();
      response.headers.set("x-aster-route", context.route.pattern);
      response.headers.set("server-timing", `aster;dur=${(performance.now() - started).toFixed(1)}`);
      return response;
    }
  ];

  return async function handle(request) {
    const url = new URL(request.url);

    if (url.pathname === liveReload.path) {
      return liveReload.response();
    }

    const frameworkAsset = await serveFrameworkAsset(root, url.pathname);

    if (frameworkAsset) {
      return frameworkAsset;
    }

    const publicAsset = await servePublicAsset(root, url.pathname);

    if (publicAsset) {
      return publicAsset;
    }

    const manifest = await createRouteManifest({ root, cacheBust: true });
    const app = createApp({
      routes: manifest.routes,
      middleware,
      onError(error) {
        return json(
          {
            error: "Aster dev server error",
            message: error?.message ?? String(error),
            stack: error?.stack
          },
          { status: 500 }
        );
      }
    });

    return injectLiveReload(await app.fetch(request));
  };
}

export async function startDevServer(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const port = Number(options.port ?? 3000);
  const host = options.host ?? "127.0.0.1";
  const liveReload = createLiveReloadHub();
  const watcher = watchProject(root, liveReload);
  const handler = await createDevHandler({ root, middleware: options.middleware, liveReload });
  const server = http.createServer(async (request, response) => {
    try {
      await sendFetchResponse(response, await handler(toFetchRequest(request, port)));
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(error?.stack ?? String(error));
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    watcher.close();
    throw error;
  }

  return {
    root,
    port,
    host,
    url: `http://${host}:${port}`,
    server,
    close() {
      return new Promise((resolve, reject) => {
        watcher.close();
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}
