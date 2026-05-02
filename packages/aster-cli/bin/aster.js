#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildProductionAssets,
  buildServerOutput,
  createRouteManifest,
  printRouteManifest
} from "../../aster-compiler/src/index.js";
import { startDevServer } from "../../aster-dev/src/index.js";
import { startNodeServer } from "../../aster-node/src/index.js";

function usage() {
  return `Aster Framework

Usage:
  aster dev [root] [--host 127.0.0.1] [--port 3000]
  aster preview [root] [--host 127.0.0.1] [--port 4173]
  aster routes [root]
  aster build [root]

Commands:
  dev      Start the dependency-free development server.
  preview  Start the production-style Node adapter.
  routes   Print the file-route manifest.
  build    Emit production route and asset manifests.
`;
}

function flag(args, name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

function positional(args, fallback = ".") {
  return args.find((arg) => !arg.startsWith("--")) ?? fallback;
}

async function dev(args) {
  const root = path.resolve(positional(args));
  const port = Number(flag(args, "--port", 3000));
  const host = flag(args, "--host", "127.0.0.1");
  const server = await startDevServer({ root, port, host });

  console.log(`Aster dev server ready at ${server.url}`);
  console.log(`Root: ${server.root}`);

  async function shutdown() {
    await server.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function preview(args) {
  const root = path.resolve(positional(args));
  const port = Number(flag(args, "--port", 4173));
  const host = flag(args, "--host", "127.0.0.1");
  const server = await startNodeServer({ root, port, host });

  console.log(`Aster preview server ready at ${server.url}`);
  console.log(`Root: ${server.root}`);

  async function shutdown() {
    await server.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function routes(args) {
  const root = path.resolve(positional(args));
  const manifest = await createRouteManifest({ root });

  console.log(printRouteManifest(manifest));
}

async function build(args) {
  const root = path.resolve(positional(args));
  const manifest = await createRouteManifest({ root });
  const assetManifest = await buildProductionAssets({ root });
  const serverManifest = await buildServerOutput({ root });
  const outDirectory = path.join(root, ".aster");
  const serializable = {
    root: manifest.root,
    routesDirectory: manifest.routesDirectory,
    routes: manifest.routes.map((route) => ({
      id: route.id,
      pattern: route.pattern,
      methods: route.methods,
      actions: route.actions.map((action) => ({
        id: action.id,
        name: action.name,
        path: action.path
      })),
      layouts: route.layouts.map((layout) => ({
        id: layout.id,
        filePath: layout.filePath
      })),
      errorBoundaries: route.errorBoundaries.map((boundary) => ({
        id: boundary.id,
        filePath: boundary.filePath
      })),
      loadingBoundaries: route.loadingBoundaries.map((boundary) => ({
        id: boundary.id,
        filePath: boundary.filePath
      })),
      filePath: route.filePath
    }))
  };

  await mkdir(outDirectory, { recursive: true });
  await writeFile(path.join(outDirectory, "manifest.json"), `${JSON.stringify(serializable, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), path.join(outDirectory, "manifest.json"))}`);
  console.log(`Wrote ${path.relative(process.cwd(), path.join(outDirectory, "assets.json"))}`);
  console.log(`Built ${Object.keys(assetManifest.assets).length} hashed assets in ${assetManifest.outputDirectory}`);
  console.log(`Built ${serverManifest.files.length} server files in ${serverManifest.outputDirectory}/server`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "dev") {
    await dev(args);
  } else if (command === "preview") {
    await preview(args);
  } else if (command === "routes") {
    await routes(args);
  } else if (command === "build") {
    await build(args);
  } else {
    console.log(usage());
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}
