import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bindAction, isAction } from "../../aster-core/src/action.js";
import { compileJsxModule } from "./jsx-transform.js";

const ROUTE_SUFFIXES = [".page.jsx", ".route.jsx", ".page.js", ".page.mjs", ".route.js", ".route.mjs"];
const LAYOUT_FILES = new Set(["layout.jsx", "layout.js", "layout.mjs"]);
const ERROR_FILES = new Set(["error.jsx", "error.js", "error.mjs"]);
const LOADING_FILES = new Set(["loading.jsx", "loading.js", "loading.mjs"]);
const HTTP_METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];

function routeSuffix(filePath) {
  return ROUTE_SUFFIXES.find((suffix) => filePath.endsWith(suffix));
}

function isLayoutFile(filePath) {
  return LAYOUT_FILES.has(path.basename(filePath));
}

function isErrorFile(filePath) {
  return ERROR_FILES.has(path.basename(filePath));
}

function isLoadingFile(filePath) {
  return LOADING_FILES.has(path.basename(filePath));
}

function isJsxFile(filePath) {
  return filePath.endsWith(".jsx");
}

async function moduleUrlFor(filePath, options) {
  if (isJsxFile(filePath)) {
    const compiled = await compileJsxModule(filePath, {
      root: options.root
    });

    return compiled.outputUrl;
  }

  return pathToFileURL(filePath).href;
}

async function walk(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(filePath, predicate)));
      continue;
    }

    if (entry.isFile() && predicate(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

function segmentToRoute(segment) {
  if (segment === "index" || (segment.startsWith("(") && segment.endsWith(")"))) {
    return null;
  }

  const catchAll = segment.match(/^\[\.\.\.([A-Za-z_$][\w$]*)\]$/);
  if (catchAll) {
    return `*${catchAll[1]}`;
  }

  const dynamic = segment.match(/^\[([A-Za-z_$][\w$]*)\]$/);
  if (dynamic) {
    return `:${dynamic[1]}`;
  }

  return segment;
}

export function routePatternFromFile(filePath, routesDirectory) {
  const suffix = routeSuffix(filePath);

  if (!suffix) {
    throw new Error(`Not a route file: ${filePath}`);
  }

  const relative = path.relative(routesDirectory, filePath).slice(0, -suffix.length);
  const segments = relative
    .split(path.sep)
    .map(segmentToRoute)
    .filter(Boolean);

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export async function discoverRouteFiles(routesDirectory) {
  const info = await stat(routesDirectory).catch(() => null);

  if (!info?.isDirectory()) {
    return [];
  }

  return (await walk(routesDirectory, routeSuffix)).sort();
}

export async function discoverLayoutFiles(appDirectory, routesDirectory) {
  const appInfo = await stat(appDirectory).catch(() => null);
  const routesInfo = await stat(routesDirectory).catch(() => null);
  const files = [];

  if (appInfo?.isDirectory()) {
    for (const fileName of ["layout.jsx", "layout.js", "layout.mjs"]) {
      const rootLayout = path.join(appDirectory, fileName);
      const rootLayoutInfo = await stat(rootLayout).catch(() => null);

      if (rootLayoutInfo?.isFile()) {
        files.push(rootLayout);
        break;
      }
    }
  }

  if (routesInfo?.isDirectory()) {
    files.push(...(await walk(routesDirectory, isLayoutFile)));
  }

  return [...new Set(files)].sort();
}

async function discoverScopedFiles(appDirectory, routesDirectory, names, predicate) {
  const appInfo = await stat(appDirectory).catch(() => null);
  const routesInfo = await stat(routesDirectory).catch(() => null);
  const files = [];

  if (appInfo?.isDirectory()) {
    for (const fileName of names) {
      const rootFile = path.join(appDirectory, fileName);
      const rootFileInfo = await stat(rootFile).catch(() => null);

      if (rootFileInfo?.isFile()) {
        files.push(rootFile);
        break;
      }
    }
  }

  if (routesInfo?.isDirectory()) {
    files.push(...(await walk(routesDirectory, predicate)));
  }

  return [...new Set(files)].sort();
}

export function boundaryChainForRoute(filePath, appDirectory, routesDirectory, boundaryByDirectory) {
  const routeDirectory = path.dirname(filePath);
  const directories = [
    path.resolve(appDirectory),
    ...ancestorDirectories(routesDirectory, routeDirectory)
  ];

  return directories
    .map((directory) => boundaryByDirectory.get(path.resolve(directory)))
    .filter(Boolean);
}

export async function discoverErrorFiles(appDirectory, routesDirectory) {
  return discoverScopedFiles(appDirectory, routesDirectory, ["error.jsx", "error.js", "error.mjs"], isErrorFile);
}

export async function discoverLoadingFiles(appDirectory, routesDirectory) {
  return discoverScopedFiles(appDirectory, routesDirectory, ["loading.jsx", "loading.js", "loading.mjs"], isLoadingFile);
}

function ancestorDirectories(fromDirectory, toDirectory) {
  const directories = [];
  let current = path.resolve(fromDirectory);
  const target = path.resolve(toDirectory);

  while (current === target || target.startsWith(`${current}${path.sep}`)) {
    directories.push(current);

    if (current === target) {
      break;
    }

    const relative = path.relative(current, target);
    const [nextSegment] = relative.split(path.sep);
    current = path.join(current, nextSegment);
  }

  return directories;
}

function layoutChainForRoute(filePath, appDirectory, routesDirectory, layoutByDirectory) {
  const routeDirectory = path.dirname(filePath);
  const directories = [
    path.resolve(appDirectory),
    ...ancestorDirectories(routesDirectory, routeDirectory)
  ];

  return directories
    .map((directory) => layoutByDirectory.get(path.resolve(directory)))
    .filter(Boolean);
}

function actionPath(id) {
  return `/_aster/action/${encodeURIComponent(id)}`;
}

function bindRouteActions(routeModule, routeId) {
  return Object.entries(routeModule)
    .filter(([, value]) => isAction(value))
    .map(([name, ref]) => {
      const id = `${routeId}#${name}`;

      bindAction(ref, {
        id,
        name,
        path: actionPath(id),
        routeId
      });

      return {
        id,
        name,
        path: ref.path,
        ref
      };
    });
}

export async function createRouteManifest(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const routesDirectory = path.resolve(root, options.routesDirectory ?? "app/routes");
  const appDirectory = path.dirname(routesDirectory);
  const files = await discoverRouteFiles(routesDirectory);
  const layoutFiles = await discoverLayoutFiles(appDirectory, routesDirectory);
  const errorFiles = await discoverErrorFiles(appDirectory, routesDirectory);
  const loadingFiles = await discoverLoadingFiles(appDirectory, routesDirectory);
  const cacheKey = options.cacheBust ? `?v=${Date.now()}` : "";
  const layouts = [];
  const errorBoundaries = [];
  const loadingBoundaries = [];
  const layoutByDirectory = new Map();
  const errorByDirectory = new Map();
  const loadingByDirectory = new Map();
  const routes = [];

  for (const filePath of layoutFiles) {
    const moduleUrl = `${await moduleUrlFor(filePath, { root })}${cacheKey}`;
    const layoutModule = await import(moduleUrl);
    const layout = {
      id: path.relative(root, filePath).replaceAll(path.sep, "/"),
      filePath,
      module: layoutModule
    };

    layouts.push(layout);
    layoutByDirectory.set(path.dirname(filePath), layout);
  }

  for (const filePath of errorFiles) {
    const moduleUrl = `${await moduleUrlFor(filePath, { root })}${cacheKey}`;
    const boundaryModule = await import(moduleUrl);
    const boundary = {
      id: path.relative(root, filePath).replaceAll(path.sep, "/"),
      filePath,
      module: boundaryModule
    };

    errorBoundaries.push(boundary);
    errorByDirectory.set(path.dirname(filePath), boundary);
  }

  for (const filePath of loadingFiles) {
    const moduleUrl = `${await moduleUrlFor(filePath, { root })}${cacheKey}`;
    const boundaryModule = await import(moduleUrl);
    const boundary = {
      id: path.relative(root, filePath).replaceAll(path.sep, "/"),
      filePath,
      module: boundaryModule
    };

    loadingBoundaries.push(boundary);
    loadingByDirectory.set(path.dirname(filePath), boundary);
  }

  for (const filePath of files) {
    const moduleUrl = `${await moduleUrlFor(filePath, { root })}${cacheKey}`;
    const routeModule = await import(moduleUrl);
    const methods = HTTP_METHODS.filter((method) => typeof routeModule[method] === "function");
    const pattern = routePatternFromFile(filePath, routesDirectory);

    const routeId = path.relative(root, filePath).replaceAll(path.sep, "/");
    const actions = bindRouteActions(routeModule, routeId);

    routes.push({
      id: routeId,
      filePath,
      pattern,
      methods,
      actions,
      layouts: layoutChainForRoute(filePath, appDirectory, routesDirectory, layoutByDirectory),
      errorBoundaries: boundaryChainForRoute(filePath, appDirectory, routesDirectory, errorByDirectory),
      loadingBoundaries: boundaryChainForRoute(filePath, appDirectory, routesDirectory, loadingByDirectory),
      module: routeModule
    });
  }

  return {
    root,
    routesDirectory,
    appDirectory,
    layouts,
    errorBoundaries,
    loadingBoundaries,
    routes
  };
}

export function printRouteManifest(manifest) {
  if (manifest.routes.length === 0) {
    return "No routes found.";
  }

  const rows = manifest.routes.map((route) => {
    const methods = route.methods.length > 0 ? route.methods.join(",") : "GET";
    const methodLabel = route.actions?.length > 0 ? `${methods}+ACTIONS` : methods;
    const layouts =
      route.layouts?.length > 0
        ? route.layouts.map((layout) => layout.id.replace(/\/layout\.m?js$/, "") || "app").join(" -> ")
        : "-";
    return `${methodLabel.padEnd(18)} ${route.pattern.padEnd(24)} ${route.id.padEnd(40)} ${layouts}`;
  });

  return ["METHODS            PATTERN                  FILE                                     LAYOUTS", ...rows].join("\n");
}
