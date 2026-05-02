import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  buildProductionAssets,
  buildServerOutput,
  createIntentGraph,
  createModuleGraph,
  createRouteManifest,
  printRouteManifest,
  routePatternFromFile,
  writeIntentGraph
} from "../packages/aster-compiler/src/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-routes-"));
  const routes = path.join(root, "app/routes");
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(routes, "blog"), { recursive: true });
  await mkdir(path.join(routes, "docs"), { recursive: true });
  await mkdir(path.join(routes, "(admin)"), { recursive: true });
  await writeFile(path.join(root, "app/layout.js"), "export default function Layout({ children }) { return children; }\n");
  await writeFile(path.join(root, "app/error.js"), "export default function ErrorBoundary() { return 'root error'; }\n");
  await writeFile(path.join(root, "app/loading.js"), "export default function LoadingBoundary() { return 'root loading'; }\n");
  await writeFile(path.join(routes, "blog/layout.js"), "export default function BlogLayout({ children }) { return children; }\n");
  await writeFile(path.join(routes, "blog/error.jsx"), "export default function BlogError() { return <main>blog error</main>; }\n");
  await writeFile(path.join(routes, "blog/loading.jsx"), "export default function BlogLoading() { return <main>blog loading</main>; }\n");
  await writeFile(path.join(routes, "index.page.js"), "export function GET() { return 'home'; }\n");
  await writeFile(
    path.join(routes, "contact.page.js"),
    `import { action } from "${coreUrl}";\nexport const intent = { actions: ["sendMessage"], security: { maxBody: "32kb" } };\nexport const sendMessage = action(async () => ({ ok: true }));\nexport function GET() { return 'contact'; }\n`
  );
  await writeFile(
    path.join(routes, "jsx.page.jsx"),
    `import { page } from "${coreUrl}";\nfunction Card({ children }) { return <article className="card">{children}</article>; }\nexport function GET() { return page(<main><Card>Hello JSX</Card></main>, { title: "JSX" }); }\n`
  );
  await writeFile(path.join(routes, "blog/[slug].page.js"), "export function POST() { return 'post'; }\n");
  await writeFile(path.join(routes, "docs/[...rest].page.js"), "export default function Page() { return 'docs'; }\n");
  await writeFile(path.join(routes, "(admin)/dashboard.page.js"), "export function GET() { return 'dash'; }\n");

  return { root, routes };
}

test("routePatternFromFile maps route filenames to URL patterns", async () => {
  const { routes } = await fixture();

  assert.equal(routePatternFromFile(path.join(routes, "index.page.js"), routes), "/");
  assert.equal(routePatternFromFile(path.join(routes, "jsx.page.jsx"), routes), "/jsx");
  assert.equal(routePatternFromFile(path.join(routes, "blog/[slug].page.js"), routes), "/blog/:slug");
  assert.equal(routePatternFromFile(path.join(routes, "docs/[...rest].page.js"), routes), "/docs/*rest");
  assert.equal(routePatternFromFile(path.join(routes, "(admin)/dashboard.page.js"), routes), "/dashboard");
});

test("createRouteManifest imports route modules and captures methods", async () => {
  const { root } = await fixture();
  const manifest = await createRouteManifest({ root, cacheBust: true });
  const routes = new Map(manifest.routes.map((route) => [route.pattern, route]));

  assert.equal(manifest.layouts.length, 2);
  assert.equal(manifest.errorBoundaries.length, 2);
  assert.equal(manifest.loadingBoundaries.length, 2);
  assert.equal(routes.get("/")?.methods.join(","), "GET");
  assert.equal(routes.get("/jsx")?.methods.join(","), "GET");
  assert.equal(routes.get("/contact")?.actions[0]?.name, "sendMessage");
  assert.deepEqual(routes.get("/contact")?.intent, {
    actions: ["sendMessage"],
    security: {
      maxBody: "32kb"
    }
  });
  assert.equal(routes.get("/contact")?.actions[0]?.id, "app/routes/contact.page.js#sendMessage");
  assert.equal(
    routes.get("/contact")?.actions[0]?.path,
    "/_aster/action/app%2Froutes%2Fcontact.page.js%23sendMessage"
  );
  assert.equal(routes.get("/blog/:slug")?.methods.join(","), "POST");
  assert.deepEqual(routes.get("/docs/*rest")?.methods, []);
  assert.deepEqual(
    routes.get("/blog/:slug")?.layouts.map((layout) => layout.id),
    ["app/layout.js", "app/routes/blog/layout.js"]
  );
  assert.deepEqual(
    routes.get("/blog/:slug")?.errorBoundaries.map((boundary) => boundary.id),
    ["app/error.js", "app/routes/blog/error.jsx"]
  );
  assert.deepEqual(
    routes.get("/blog/:slug")?.loadingBoundaries.map((boundary) => boundary.id),
    ["app/loading.js", "app/routes/blog/loading.jsx"]
  );
  assert.deepEqual(routes.get("/")?.layouts.map((layout) => layout.id), ["app/layout.js"]);
  assert.match(routes.get("/jsx")?.filePath, /jsx\.page\.jsx$/);
  assert.match(routes.get("/jsx")?.module.GET().body.toString(), /Hello JSX/);
  assert.match(printRouteManifest(manifest), /\/blog\/:slug/);
  assert.match(printRouteManifest(manifest), /GET\+ACTIONS\s+\/contact/);
  assert.match(printRouteManifest(manifest), /app -> app\/routes\/blog/);
});

test("createIntentGraph serializes route intent and action diagnostics", async () => {
  const { root } = await fixture();
  const manifest = await createRouteManifest({ root, cacheBust: true });
  const graph = createIntentGraph(manifest);
  const contact = graph.routes.find((route) => route.pattern === "/contact");

  assert.deepEqual(contact.intent.actions, ["sendMessage"]);
  assert.deepEqual(contact.actions, [
    {
      id: "app/routes/contact.page.js#sendMessage",
      name: "sendMessage",
      path: "/_aster/action/app%2Froutes%2Fcontact.page.js%23sendMessage",
      declared: true
    }
  ]);
  assert.deepEqual(graph.diagnostics, []);

  await writeIntentGraph(graph, { root });
  assert.match(await readFile(path.join(root, ".aster/intent.json"), "utf8"), /"actions": \[/);
  assert.match(await readFile(path.join(root, ".aster/output/intent-graph.json"), "utf8"), /"\/contact"/);
});

test("buildProductionAssets emits hashed public and app browser assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-assets-"));

  await mkdir(path.join(root, "public"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "public/styles.css"), "/* dev */\n.hero { color: teal; }\n");
  await writeFile(path.join(root, "app/components/label.js"), "export const label = 'Count';\n");
  await writeFile(
    path.join(root, "app/components/counter.js"),
    "import { label } from './label.js';\nexport default function hydrate() { return label; }\n"
  );

  const manifest = await buildProductionAssets({ root });
  const style = manifest.assets["/styles.css"];
  const counter = manifest.assets["/_aster/app/components/counter.js"];
  const label = manifest.assets["/_aster/app/components/label.js"];
  const counterOutput = await readFile(path.join(root, manifest.outputDirectory, counter.file), "utf8");

  assert.equal(manifest.outputDirectory, ".aster/output");
  assert.match(style.url, /^\/_aster\/assets\/public\/styles\.[a-f0-9]{10}\.css$/);
  assert.match(counter.url, /^\/_aster\/assets\/app\/components\/counter\.[a-f0-9]{10}\.js$/);
  assert.match(label.url, /^\/_aster\/assets\/app\/components\/label\.[a-f0-9]{10}\.js$/);
  assert.equal(style.file.startsWith("assets/public/"), true);
  assert.equal(counter.file.startsWith("assets/app/components/"), true);
  assert.equal((await readFile(path.join(root, manifest.outputDirectory, style.file), "utf8")), ".hero{color:teal;}");
  assert.match(counterOutput, new RegExp(`import \\{ label \\} from '${label.url.replaceAll("/", "\\/")}'`));
  assert.deepEqual(manifest.graph.modules, ["app/components/counter.js", "app/components/label.js"]);
  assert.match(await readFile(path.join(root, ".aster/assets.json"), "utf8"), /"\/styles\.css"/);
  assert.match(await readFile(path.join(root, ".aster/graph.json"), "utf8"), /"client"/);
});

test("createModuleGraph traces server and client dependencies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-module-graph-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await mkdir(path.join(root, "app/lib"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "app/lib/message.js"), "export const message = 'from shared server module';\n");
  await writeFile(path.join(root, "app/lib/unused.js"), "export const unused = true;\n");
  await writeFile(path.join(root, "app/components/label.js"), "export const label = 'Count';\n");
  await writeFile(path.join(root, "app/components/counter.js"), "import { label } from './label.js';\nexport default () => label;\n");
  await writeFile(
    path.join(root, "app/routes/index.page.js"),
    `import { page } from "${coreUrl}";
import { message } from "../lib/message";
export function GET() {
  return page(message);
}
`
  );

  const graph = await createModuleGraph({ root });

  assert.deepEqual(graph.server.modules.map((module) => module.id), [
    "app/lib/message.js",
    "app/routes/index.page.js"
  ]);
  assert.deepEqual(graph.client.modules.map((module) => module.id), [
    "app/components/counter.js",
    "app/components/label.js"
  ]);
  assert.equal(graph.server.modules.some((module) => module.id === "app/lib/unused.js"), false);
  assert.deepEqual(graph.server.modules.find((module) => module.id === "app/routes/index.page.js")?.imports, [
    {
      specifier: "../lib/message",
      resolved: "app/lib/message.js"
    },
    {
      specifier: coreUrl,
      external: true
    }
  ]);
});

test("buildServerOutput copies traced server modules and rewrites runtime imports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-server-output-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await mkdir(path.join(root, "app/lib"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "app/lib/message.js"), "export const message = 'Built JSX';\n");
  await writeFile(path.join(root, "app/lib/unused.js"), "export const unused = true;\n");
  await writeFile(path.join(root, "app/components/counter.js"), "export default function hydrate() {}\n");
  await writeFile(
    path.join(root, "app/routes/jsx.page.jsx"),
    `import { page } from "${coreUrl}";
import { message } from "../lib/message";
export function GET() {
  return page(<main>{message}</main>, { title: "Built" });
}
`
  );

  const manifest = await buildServerOutput({ root });
  const routeOutput = await readFile(path.join(root, ".aster/output/server/app/routes/jsx.page.js"), "utf8");
  const sharedOutput = await readFile(path.join(root, ".aster/output/server/app/lib/message.js"), "utf8");
  const copiedCore = await readFile(path.join(root, ".aster/output/server/packages/aster-core/src/index.js"), "utf8");

  assert.equal(manifest.serverRoot, "server");
  assert.deepEqual(manifest.files, [
    {
      source: "app/lib/message.js",
      file: "server/app/lib/message.js"
    },
    {
      source: "app/routes/jsx.page.jsx",
      file: "server/app/routes/jsx.page.js"
    }
  ]);
  assert.match(routeOutput, /__asterJsx\("main"/);
  assert.match(routeOutput, /from "\.\.\/lib\/message\.js"/);
  assert.match(routeOutput, /packages\/aster-core\/src\/index\.js/);
  assert.doesNotMatch(routeOutput, /file:\/\//);
  assert.match(sharedOutput, /Built JSX/);
  await assert.rejects(
    () => readFile(path.join(root, ".aster/output/server/app/lib/unused.js"), "utf8"),
    /ENOENT/
  );
  assert.deepEqual(manifest.graph.modules, ["app/lib/message.js", "app/routes/jsx.page.jsx"]);
  assert.match(copiedCore, /export \{ action/);
  assert.match(await readFile(path.join(root, ".aster/server.json"), "utf8"), /"serverRoot": "server"/);
});
