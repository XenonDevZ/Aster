import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModuleGraph, resolveModuleSpecifier } from "./graph.js";
import { transformJsx } from "./jsx-transform.js";

const DEFAULT_OUTPUT_DIRECTORY = ".aster/output";
const DEFAULT_ASSETS_BASE = "/_aster/assets/";
const APP_ASSET_EXTENSIONS = new Set([".css", ".js", ".json", ".mjs", ".png", ".svg", ".txt", ".webp"]);
const REWRITABLE_CLIENT_EXTENSIONS = new Set([".js", ".mjs"]);
const SERVER_FILE_EXTENSIONS = new Set([".js", ".mjs", ".jsx", ".json"]);
const COMPILER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CORE_SOURCE_DIRECTORY = path.resolve(COMPILER_DIRECTORY, "../../aster-core/src");

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

function ensureRelativeSpecifier(fromFile, toFile) {
  let specifier = slashPath(path.relative(path.dirname(fromFile), toFile));

  if (!specifier.startsWith(".")) {
    specifier = `./${specifier}`;
  }

  return specifier;
}

function assetHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 10);
}

function assetIntegrity(buffer) {
  return `sha256-${createHash("sha256").update(buffer).digest("base64")}`;
}

function hashedFileName(relativePath, hash) {
  const directory = path.dirname(relativePath);
  const extension = path.extname(relativePath);
  const basename = path.basename(relativePath, extension);
  const fileName = extension ? `${basename}.${hash}${extension}` : `${basename}.${hash}`;

  return directory === "." ? fileName : slashPath(path.join(directory, fileName));
}

function assetOutputFile(asset, hash) {
  return slashPath(path.join("assets", asset.type, hashedFileName(asset.relativePath, hash)));
}

function assetOutputUrl(asset, hash, assetsBase) {
  return `${assetsBase}${slashPath(path.join(asset.type, hashedFileName(asset.relativePath, hash)))}`;
}

function minifyCss(buffer) {
  return Buffer.from(
    buffer
      .toString("utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{}:;,>])\s*/g, "$1")
      .trim()
  );
}

function prepareAssetBytes(filePath, buffer, options) {
  if (options.minify === false) {
    return buffer;
  }

  return path.extname(filePath) === ".css" ? minifyCss(buffer) : buffer;
}

async function collectPublicAssets(root) {
  const publicDirectory = path.join(root, "public");
  const files = await walkFiles(publicDirectory);

  return files.map((filePath) => {
    const relativePath = slashPath(path.relative(publicDirectory, filePath));

    return {
      type: "public",
      filePath,
      relativePath,
      source: slashPath(path.relative(root, filePath)),
      originalUrl: `/${relativePath}`
    };
  });
}

async function collectAppAssets(root, graph) {
  const appDirectory = path.join(root, "app");
  const componentsDirectory = path.join(appDirectory, "components");
  const graphFiles = new Set(graph?.client?.modules?.map((module) => module.filePath) ?? []);
  const files = [...graphFiles];

  for (const filePath of await walkFiles(componentsDirectory)) {
    const extension = path.extname(filePath);

    if (!APP_ASSET_EXTENSIONS.has(extension)) {
      continue;
    }

    if (!graphFiles.has(filePath) && !REWRITABLE_CLIENT_EXTENSIONS.has(extension)) {
      files.push(filePath);
    }
  }

  return files.map((filePath) => {
    const relativePath = slashPath(path.relative(appDirectory, filePath));

    return {
      type: "app",
      filePath,
      relativePath,
      source: slashPath(path.relative(root, filePath)),
      originalUrl: `/_aster/app/${relativePath}`
    };
  });
}

async function rewriteClientModuleImports(code, asset, recordsByFilePath, hashByUrl, assetsBase) {
  const importPattern = /(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"']+)(["'])/g;
  let output = "";
  let cursor = 0;

  for (const match of code.matchAll(importPattern)) {
    const [full, prefix, specifier, suffix] = match;
    const start = match.index;
    const end = start + full.length;
    const resolved = await resolveModuleSpecifier(specifier, asset.filePath);
    const record = resolved ? recordsByFilePath.get(resolved) : null;

    output += code.slice(cursor, start);

    if (record?.type === "app") {
      output += `${prefix}${assetOutputUrl(record, hashByUrl.get(record.originalUrl), assetsBase)}${suffix}`;
    } else {
      output += full;
    }

    cursor = end;
  }

  return `${output}${code.slice(cursor)}`;
}

async function finalizeAssetRecords(records, assetsBase, options) {
  const recordsByFilePath = new Map(records.map((record) => [record.filePath, record]));
  let hashByUrl = new Map(records.map((record) => [record.originalUrl, assetHash(record.sourceBytes)]));

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const nextHashes = new Map();
    let changed = false;

    for (const record of records) {
      let bytes = prepareAssetBytes(record.filePath, record.sourceBytes, options);

      if (record.type === "app" && REWRITABLE_CLIENT_EXTENSIONS.has(path.extname(record.filePath))) {
        const code = await rewriteClientModuleImports(bytes.toString("utf8"), record, recordsByFilePath, hashByUrl, assetsBase);
        bytes = Buffer.from(code);
      }

      record.bytes = bytes;
      const hash = assetHash(bytes);
      nextHashes.set(record.originalUrl, hash);

      if (hash !== hashByUrl.get(record.originalUrl)) {
        changed = true;
      }
    }

    hashByUrl = nextHashes;

    if (!changed) {
      break;
    }
  }

  return hashByUrl;
}

async function writeModuleGraphManifest(root, outputDirectory, graph) {
  const absoluteOutputDirectory = path.resolve(root, outputDirectory);

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await mkdir(absoluteOutputDirectory, { recursive: true });
  await writeFile(path.join(root, ".aster/graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(path.join(absoluteOutputDirectory, "module-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

export async function buildProductionAssets(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY;
  const assetsBase = options.assetsBase ?? DEFAULT_ASSETS_BASE;
  const absoluteOutputDirectory = path.resolve(root, outputDirectory);
  const absoluteAssetsDirectory = path.join(absoluteOutputDirectory, "assets");
  const graph = options.graph ?? (await createModuleGraph({ root }));
  const assets = {};

  if (options.clean !== false) {
    await rm(absoluteAssetsDirectory, { recursive: true, force: true });
  }

  await mkdir(absoluteAssetsDirectory, { recursive: true });

  const records = await Promise.all(
    [...(await collectPublicAssets(root)), ...(await collectAppAssets(root, graph))].map(async (asset) => ({
      ...asset,
      sourceBytes: await readFile(asset.filePath)
    }))
  );
  const hashByUrl = await finalizeAssetRecords(records, assetsBase, options);

  for (const asset of records) {
    const hash = hashByUrl.get(asset.originalUrl);
    const file = assetOutputFile(asset, hash);
    const url = assetOutputUrl(asset, hash, assetsBase);

    await mkdir(path.dirname(path.join(absoluteOutputDirectory, file)), { recursive: true });
    await writeFile(path.join(absoluteOutputDirectory, file), asset.bytes);

    assets[asset.originalUrl] = {
      type: asset.type,
      source: asset.source,
      file,
      url,
      size: asset.bytes.byteLength,
      hash,
      integrity: assetIntegrity(asset.bytes)
    };
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    outputDirectory: slashPath(outputDirectory),
    assetsBase,
    assets,
    graph: {
      entries: graph.client.entries,
      modules: graph.client.modules.map((module) => module.id),
      diagnostics: graph.client.diagnostics
    }
  };

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await writeFile(path.join(root, ".aster/assets.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(absoluteOutputDirectory, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeModuleGraphManifest(root, outputDirectory, graph);

  return manifest;
}

export function rewriteAssetUrls(markup, manifest) {
  if (!manifest?.assets) {
    return markup;
  }

  return Object.entries(manifest.assets)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((html, [sourceUrl, asset]) => html.split(sourceUrl).join(asset.url), markup);
}

function serverAppRelativePath(relativePath) {
  return relativePath.replace(/\.jsx$/, ".js");
}

function serverAppOutputPath(root, serverRoot, sourceFile) {
  const appDirectory = path.join(root, "app");
  const relativePath = slashPath(path.relative(appDirectory, sourceFile));
  return path.join(serverRoot, "app", serverAppRelativePath(relativePath));
}

function coreOutputPath(serverRoot, sourceFile) {
  return path.join(serverRoot, "packages/aster-core/src", path.relative(CORE_SOURCE_DIRECTORY, sourceFile));
}

function resolvedSpecifierPath(specifier, sourceFile) {
  if (specifier.startsWith("file://")) {
    return fileURLToPath(specifier);
  }

  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(sourceFile), specifier);
  }

  return null;
}

async function rewriteServerSpecifier(specifier, sourceFile, outputFile, root, serverRoot) {
  if (specifier === "@aster/core") {
    return ensureRelativeSpecifier(outputFile, path.join(serverRoot, "packages/aster-core/src/index.js"));
  }

  if (specifier.startsWith("@aster/core/")) {
    return ensureRelativeSpecifier(
      outputFile,
      path.join(serverRoot, "packages/aster-core/src", `${specifier.slice("@aster/core/".length)}.js`)
    );
  }

  const resolved = (await resolveModuleSpecifier(specifier, sourceFile)) ?? resolvedSpecifierPath(specifier, sourceFile);

  if (!resolved) {
    return specifier;
  }

  if (resolved === CORE_SOURCE_DIRECTORY || isInside(CORE_SOURCE_DIRECTORY, resolved)) {
    return ensureRelativeSpecifier(outputFile, coreOutputPath(serverRoot, resolved));
  }

  const appDirectory = path.join(root, "app");

  if (resolved === appDirectory || isInside(appDirectory, resolved)) {
    return ensureRelativeSpecifier(outputFile, serverAppOutputPath(root, serverRoot, resolved));
  }

  return specifier;
}

async function rewriteServerImports(code, sourceFile, outputFile, root, serverRoot) {
  const importPattern = /(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"']+)(["'])/g;
  let output = "";
  let cursor = 0;

  for (const match of code.matchAll(importPattern)) {
    const [full, prefix, specifier, suffix] = match;
    const start = match.index;
    const end = start + full.length;

    output += code.slice(cursor, start);
    output += `${prefix}${await rewriteServerSpecifier(specifier, sourceFile, outputFile, root, serverRoot)}${suffix}`;
    cursor = end;
  }

  return `${output}${code.slice(cursor)}`;
}

async function copyCoreRuntime(serverRoot) {
  const files = await walkFiles(CORE_SOURCE_DIRECTORY);
  const copied = [];

  for (const filePath of files) {
    const relativePath = slashPath(path.relative(CORE_SOURCE_DIRECTORY, filePath));
    const outputPath = path.join(serverRoot, "packages/aster-core/src", relativePath);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readFile(filePath));
    copied.push(slashPath(path.relative(serverRoot, outputPath)));
  }

  return copied;
}

export async function buildServerOutput(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY;
  const absoluteOutputDirectory = path.resolve(root, outputDirectory);
  const serverRoot = path.join(absoluteOutputDirectory, "server");
  const graph = options.graph ?? (await createModuleGraph({ root }));
  const files = graph.server.modules
    .map((module) => module.filePath)
    .filter((filePath) => SERVER_FILE_EXTENSIONS.has(path.extname(filePath)));
  const serverFiles = [];

  if (options.clean !== false) {
    await rm(serverRoot, { recursive: true, force: true });
  }

  await mkdir(serverRoot, { recursive: true });
  await writeFile(path.join(serverRoot, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);

  for (const filePath of files) {
    const outputPath = serverAppOutputPath(root, serverRoot, filePath);
    const source = await readFile(filePath, "utf8");
    const transformed = filePath.endsWith(".jsx") ? transformJsx(source).code : source;
    const code = await rewriteServerImports(transformed, filePath, outputPath, root, serverRoot);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${code.trimEnd()}\n`);
    serverFiles.push({
      source: slashPath(path.relative(root, filePath)),
      file: slashPath(path.relative(absoluteOutputDirectory, outputPath))
    });
  }

  const runtimeFiles = await copyCoreRuntime(serverRoot);
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    outputDirectory: slashPath(outputDirectory),
    serverRoot: "server",
    appDirectory: "server/app",
    files: serverFiles,
    graph: {
      entries: graph.server.entries,
      modules: graph.server.modules.map((module) => module.id),
      externals: graph.server.externals,
      diagnostics: graph.server.diagnostics
    },
    runtime: {
      "@aster/core": "server/packages/aster-core/src/index.js",
      files: runtimeFiles
    }
  };

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await writeFile(path.join(root, ".aster/server.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(serverRoot, "server-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeModuleGraphManifest(root, outputDirectory, graph);

  return manifest;
}
