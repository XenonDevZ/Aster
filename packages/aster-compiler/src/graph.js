import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverErrorFiles,
  discoverLayoutFiles,
  discoverLoadingFiles,
  discoverRouteFiles
} from "./manifest.js";

const MODULE_EXTENSIONS = [".js", ".mjs", ".jsx", ".ts", ".tsx", ".json"];
const CLIENT_ENTRY_EXTENSIONS = new Set([".js", ".mjs", ".ts"]);

async function fileExists(filePath) {
  const info = await stat(filePath).catch(() => null);
  return Boolean(info?.isFile());
}

async function directoryExists(directory) {
  const info = await stat(directory).catch(() => null);
  return Boolean(info?.isDirectory());
}

async function walkFiles(directory) {
  if (!(await directoryExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(filePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(filePath);
    }
  }

  return files.sort();
}

function slashPath(value) {
  return value.split(path.sep).join("/");
}

function isInside(directory, filePath) {
  const relative = path.relative(directory, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function appId(root, filePath) {
  return slashPath(path.relative(root, filePath));
}

export function parseModuleSpecifiers(source) {
  const pattern =
    /(?:import|export)\s+(?:[^'"()]*?\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const specifiers = [];

  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1] ?? match[2]);
  }

  return [...new Set(specifiers)];
}

export async function resolveModuleSpecifier(specifier, importer) {
  let basePath;

  if (specifier.startsWith("file://")) {
    basePath = fileURLToPath(specifier);
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(importer), specifier);
  } else {
    return null;
  }

  if (await fileExists(basePath)) {
    return basePath;
  }

  if (!path.extname(basePath)) {
    for (const extension of MODULE_EXTENSIONS) {
      const withExtension = `${basePath}${extension}`;

      if (await fileExists(withExtension)) {
        return withExtension;
      }
    }
  }

  if (await directoryExists(basePath)) {
    for (const extension of MODULE_EXTENSIONS) {
      const indexFile = path.join(basePath, `index${extension}`);

      if (await fileExists(indexFile)) {
        return indexFile;
      }
    }
  }

  return null;
}

async function traceGraph({ root, entries, scope, isClientModule }) {
  const modules = new Map();
  const externals = new Map();
  const diagnostics = [];
  const queue = [...new Set(entries.map((entry) => path.resolve(entry)))].sort();

  while (queue.length > 0) {
    const filePath = queue.shift();
    const id = appId(root, filePath);

    if (modules.has(id)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const imports = [];

    modules.set(id, {
      id,
      filePath,
      imports
    });

    for (const specifier of parseModuleSpecifiers(source)) {
      const resolved = await resolveModuleSpecifier(specifier, filePath);

      if (!resolved || (!isInside(root, resolved) && path.resolve(root) !== path.resolve(resolved))) {
        const key = `${specifier}\0${id}`;
        externals.set(key, {
          specifier,
          importedBy: id
        });
        imports.push({ specifier, external: true });
        continue;
      }

      const resolvedId = appId(root, resolved);

      imports.push({
        specifier,
        resolved: resolvedId
      });

      if (scope === "server" && resolvedId.startsWith("app/components/")) {
        diagnostics.push({
          level: "warning",
          code: "server-imports-island-module",
          message: `Server module ${id} imports browser island module ${resolvedId}.`,
          importer: id,
          imported: resolvedId
        });
      }

      if (scope === "client" && !isClientModule(resolved)) {
        diagnostics.push({
          level: "warning",
          code: "client-imports-server-module",
          message: `Client island module ${id} imports app module ${resolvedId} outside the client graph root.`,
          importer: id,
          imported: resolvedId
        });
      }

      if (!modules.has(resolvedId) && !queue.includes(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return {
    entries: entries.map((entry) => appId(root, entry)).sort(),
    modules: [...modules.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((module) => ({
        ...module,
        imports: module.imports.sort((left, right) => left.specifier.localeCompare(right.specifier))
      })),
    externals: [...externals.values()].sort((left, right) =>
      `${left.importedBy}:${left.specifier}`.localeCompare(`${right.importedBy}:${right.specifier}`)
    ),
    diagnostics
  };
}

async function collectServerEntries(root) {
  const routesDirectory = path.join(root, "app/routes");
  const appDirectory = path.dirname(routesDirectory);

  return [
    ...(await discoverRouteFiles(routesDirectory)),
    ...(await discoverLayoutFiles(appDirectory, routesDirectory)),
    ...(await discoverErrorFiles(appDirectory, routesDirectory)),
    ...(await discoverLoadingFiles(appDirectory, routesDirectory))
  ].sort();
}

async function collectClientEntries(root) {
  const componentsDirectory = path.join(root, "app/components");

  return (await walkFiles(componentsDirectory))
    .filter((filePath) => CLIENT_ENTRY_EXTENSIONS.has(path.extname(filePath)))
    .sort();
}

export async function createModuleGraph(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const appDirectory = path.join(root, "app");
  const componentsDirectory = path.join(appDirectory, "components");
  const serverEntries = options.serverEntries ?? (await collectServerEntries(root));
  const clientEntries = options.clientEntries ?? (await collectClientEntries(root));
  const isClientModule = (filePath) =>
    path.resolve(filePath) === path.resolve(componentsDirectory) || isInside(componentsDirectory, filePath);

  const server = await traceGraph({
    root,
    entries: serverEntries,
    scope: "server",
    isClientModule
  });
  const client = await traceGraph({
    root,
    entries: clientEntries,
    scope: "client",
    isClientModule
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root,
    server,
    client
  };
}
