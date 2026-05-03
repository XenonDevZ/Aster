import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createApp, json } from "../../aster-core/src/index.js";
import { createRouteManifest, rewriteAssetUrls } from "../../aster-compiler/src/index.js";
import { serveBuiltAsset, serveFrameworkAsset, servePublicAsset } from "../../aster-dev/src/static.js";

const DEFAULT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'"
].join("; ");

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

export function toFetchRequest(request, port) {
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

export async function sendFetchResponse(nodeResponse, fetchResponse) {
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

async function readAssetManifest(root, options = {}) {
  if (options.assets === false) {
    return null;
  }

  const manifestPath = path.resolve(root, options.assetManifestPath ?? ".aster/assets.json");
  const source = await readFile(manifestPath, "utf8").catch(() => null);

  if (!source) {
    if (options.requireBuild) {
      throw new Error(`Aster asset manifest was not found at ${manifestPath}. Run "aster build" before "aster start".`);
    }

    return null;
  }

  return JSON.parse(source);
}

async function readServerManifest(root, options = {}) {
  if (options.serverBuild === false) {
    return null;
  }

  const manifestPath = path.resolve(root, options.serverManifestPath ?? ".aster/server.json");
  const source = await readFile(manifestPath, "utf8").catch(() => null);

  if (!source) {
    if (options.requireBuild) {
      throw new Error(`Aster server manifest was not found at ${manifestPath}. Run "aster build" before "aster start".`);
    }

    return null;
  }

  return JSON.parse(source);
}

function builtServerRoot(root, manifest) {
  if (!manifest?.outputDirectory || !manifest?.serverRoot) {
    return root;
  }

  return path.resolve(root, manifest.outputDirectory, manifest.serverRoot);
}

async function rewriteAssetResponse(response, manifest) {
  if (!manifest?.assets || !response.body) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(rewriteAssetUrls(await response.text(), manifest), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function applySecurityHeaders(response, options = {}) {
  if (options.securityHeaders === false) {
    return response;
  }

  const headers = response.headers;

  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }

  if (!headers.has("referrer-policy")) {
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
  }

  if (!headers.has("x-frame-options")) {
    headers.set("x-frame-options", "SAMEORIGIN");
  }

  if (!headers.has("cross-origin-opener-policy")) {
    headers.set("cross-origin-opener-policy", "same-origin");
  }

  if (!headers.has("permissions-policy")) {
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  }

  if (options.contentSecurityPolicy !== false && !headers.has("content-security-policy")) {
    headers.set("content-security-policy", options.contentSecurityPolicy ?? DEFAULT_CONTENT_SECURITY_POLICY);
  }

  return response;
}

export async function createNodeHandler(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const serverManifest = await readServerManifest(root, options);
  const routeRoot = builtServerRoot(root, serverManifest);
  const manifest = await createRouteManifest({ root: routeRoot, cacheBust: false });
  const assetManifest = await readAssetManifest(root, options);
  const app = createApp({
    routes: manifest.routes,
    middleware: options.middleware ?? [],
    actionCsrf: options.actionCsrf ?? "strict",
    allowedActionOrigins: options.allowedActionOrigins ?? [],
    maxActionBodySize: options.maxActionBodySize,
    onError(error) {
      return json(
        {
          error: "Aster server error",
          message: error?.message ?? String(error)
        },
        { status: 500 }
      );
    }
  });

  return async function handle(request) {
    const url = new URL(request.url);
    const builtAsset = await serveBuiltAsset(root, url.pathname, assetManifest);

    if (builtAsset) {
      builtAsset.headers.set("x-aster-adapter", "node");
      return applySecurityHeaders(builtAsset, options);
    }

    if ((assetManifest || serverManifest) && url.pathname.startsWith("/_aster/app/")) {
      return applySecurityHeaders(json({ error: "Asset Not Found" }, { status: 404 }), options);
    }

    const frameworkAsset = await serveFrameworkAsset(root, url.pathname);

    if (frameworkAsset) {
      frameworkAsset.headers.set("x-aster-adapter", "node");
      return applySecurityHeaders(frameworkAsset, options);
    }

    const publicAsset = await servePublicAsset(root, url.pathname);

    if (publicAsset) {
      publicAsset.headers.set("x-aster-adapter", "node");
      return applySecurityHeaders(publicAsset, options);
    }

    const response = await app.fetch(request);
    response.headers.set("x-aster-adapter", "node");
    return applySecurityHeaders(await rewriteAssetResponse(response, assetManifest), options);
  };
}

export async function startNodeServer(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const port = Number(options.port ?? 4173);
  const host = options.host ?? "127.0.0.1";
  const handler = await createNodeHandler(options);
  const server = http.createServer(async (request, response) => {
    try {
      await sendFetchResponse(response, await handler(toFetchRequest(request, port)));
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(error?.stack ?? String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    root,
    port,
    host,
    url: `http://${host}:${port}`,
    server,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}
