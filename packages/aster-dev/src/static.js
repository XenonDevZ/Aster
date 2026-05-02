import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.resolve(root, normalized.replace(/^\/+/, ""));
  const resolvedRoot = path.resolve(root);

  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  return filePath;
}

async function readStaticFile(root, requestPath, options = {}) {
  const filePath = safeJoin(root, requestPath);

  if (!filePath) {
    return null;
  }

  const info = await stat(filePath).catch(() => null);

  if (!info?.isFile()) {
    return null;
  }

  const body = await readFile(filePath);
  const contentType = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";

  return new Response(body, {
    headers: {
      "cache-control": options.cacheControl ?? "no-store",
      "content-type": contentType
    }
  });
}

export async function serveFrameworkAsset(root, pathname) {
  const prefix = "/_aster/app/";

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  return readStaticFile(path.join(root, "app"), pathname.slice(prefix.length));
}

export async function servePublicAsset(root, pathname) {
  return readStaticFile(path.join(root, "public"), pathname);
}

export async function serveBuiltAsset(root, pathname, manifest) {
  if (!manifest?.assets) {
    return null;
  }

  const asset = Object.values(manifest.assets).find((entry) => entry.url === pathname);

  if (!asset) {
    return null;
  }

  return readStaticFile(path.join(root, manifest.outputDirectory ?? ".aster/output"), asset.file, {
    cacheControl: "public, max-age=31536000, immutable"
  });
}
