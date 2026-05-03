import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveModuleSpecifier } from "../../aster-compiler/src/graph.js";
import { isCompilableSourceFile, transformSourceModule } from "../../aster-compiler/src/jsx-transform.js";

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

function slashPath(value) {
  return value.split(path.sep).join("/");
}

function appAssetUrl(root, filePath) {
  return `/_aster/app/${slashPath(path.relative(path.join(root, "app"), filePath))}`;
}

function isInside(directory, filePath) {
  const relative = path.relative(directory, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function rewriteFrameworkModuleImports(code, filePath, root) {
  const importPattern = /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g;
  let output = "";
  let cursor = 0;

  for (const match of code.matchAll(importPattern)) {
    const [full, prefix, quote, specifier] = match;
    const start = match.index;
    const end = start + full.length;
    const resolved = await resolveModuleSpecifier(specifier, filePath);
    const appRoot = path.join(root, "app");

    output += code.slice(cursor, start);
    output += resolved && (path.resolve(resolved) === path.resolve(appRoot) || isInside(appRoot, resolved))
      ? `${prefix}${quote}${appAssetUrl(root, resolved)}${quote}`
      : full;
    cursor = end;
  }

  return `${output}${code.slice(cursor)}`;
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

  const appRoot = path.join(root, "app");
  const filePath = safeJoin(appRoot, pathname.slice(prefix.length));
  const info = filePath ? await stat(filePath).catch(() => null) : null;

  if (info?.isFile() && isCompilableSourceFile(filePath)) {
    const source = await readFile(filePath, "utf8");
    const transformed = transformSourceModule(source, { filePath }).code;

    return new Response(await rewriteFrameworkModuleImports(transformed, filePath, root), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8"
      }
    });
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
