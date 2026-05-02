import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformJsx } from "./jsx-transform.js";

const DEFAULT_OUTPUT_DIRECTORY = ".aster/output";
const DEFAULT_ASSETS_BASE = "/_aster/assets/";
const APP_ASSET_EXTENSIONS = new Set([".css", ".js", ".json", ".mjs", ".png", ".svg", ".txt", ".webp"]);
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

async function collectAppAssets(root) {
  const appDirectory = path.join(root, "app");
  const componentsDirectory = path.join(appDirectory, "components");
  const files = (await walkFiles(componentsDirectory)).filter((filePath) =>
    APP_ASSET_EXTENSIONS.has(path.extname(filePath))
  );

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

export async function buildProductionAssets(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY;
  const assetsBase = options.assetsBase ?? DEFAULT_ASSETS_BASE;
  const absoluteOutputDirectory = path.resolve(root, outputDirectory);
  const absoluteAssetsDirectory = path.join(absoluteOutputDirectory, "assets");
  const assets = {};

  if (options.clean !== false) {
    await rm(absoluteAssetsDirectory, { recursive: true, force: true });
  }

  await mkdir(absoluteAssetsDirectory, { recursive: true });

  for (const asset of [...(await collectPublicAssets(root)), ...(await collectAppAssets(root))]) {
    const sourceBytes = await readFile(asset.filePath);
    const bytes = prepareAssetBytes(asset.filePath, sourceBytes, options);
    const hash = assetHash(bytes);
    const file = slashPath(path.join("assets", asset.type, hashedFileName(asset.relativePath, hash)));
    const url = `${assetsBase}${slashPath(path.join(asset.type, hashedFileName(asset.relativePath, hash)))}`;

    await mkdir(path.dirname(path.join(absoluteOutputDirectory, file)), { recursive: true });
    await writeFile(path.join(absoluteOutputDirectory, file), bytes);

    assets[asset.originalUrl] = {
      type: asset.type,
      source: asset.source,
      file,
      url,
      size: bytes.byteLength,
      hash,
      integrity: assetIntegrity(bytes)
    };
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    outputDirectory: slashPath(outputDirectory),
    assetsBase,
    assets
  };

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await writeFile(path.join(root, ".aster/assets.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(absoluteOutputDirectory, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

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

function rewriteServerSpecifier(specifier, sourceFile, outputFile, root, serverRoot) {
  if (specifier === "@aster/core") {
    return ensureRelativeSpecifier(outputFile, path.join(serverRoot, "packages/aster-core/src/index.js"));
  }

  if (specifier.startsWith("@aster/core/")) {
    return ensureRelativeSpecifier(
      outputFile,
      path.join(serverRoot, "packages/aster-core/src", `${specifier.slice("@aster/core/".length)}.js`)
    );
  }

  const resolved = resolvedSpecifierPath(specifier, sourceFile);

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

function rewriteServerImports(code, sourceFile, outputFile, root, serverRoot) {
  const importPattern = /(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"']+)(["'])/g;

  return code.replace(importPattern, (match, prefix, specifier, suffix) => {
    return `${prefix}${rewriteServerSpecifier(specifier, sourceFile, outputFile, root, serverRoot)}${suffix}`;
  });
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
  const appDirectory = path.join(root, "app");
  const files = (await walkFiles(appDirectory)).filter((filePath) => {
    const relativePath = slashPath(path.relative(appDirectory, filePath));

    return !relativePath.startsWith("components/") && SERVER_FILE_EXTENSIONS.has(path.extname(filePath));
  });
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
    const code = rewriteServerImports(transformed, filePath, outputPath, root, serverRoot);

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
    runtime: {
      "@aster/core": "server/packages/aster-core/src/index.js",
      files: runtimeFiles
    }
  };

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await writeFile(path.join(root, ".aster/server.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(serverRoot, "server-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}
