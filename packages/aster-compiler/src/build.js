import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIRECTORY = ".aster/output";
const DEFAULT_ASSETS_BASE = "/_aster/assets/";
const APP_ASSET_EXTENSIONS = new Set([".css", ".js", ".json", ".mjs", ".png", ".svg", ".txt", ".webp"]);

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
