import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  buildProductionAssets,
  createRouteManifest,
  printRouteManifest,
  routePatternFromFile
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
    `import { action } from "${coreUrl}";\nexport const sendMessage = action(async () => ({ ok: true }));\nexport function GET() { return 'contact'; }\n`
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

test("buildProductionAssets emits hashed public and app browser assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-assets-"));

  await mkdir(path.join(root, "public"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "public/styles.css"), "/* dev */\n.hero { color: teal; }\n");
  await writeFile(path.join(root, "app/components/counter.js"), "export default function hydrate() {}\n");

  const manifest = await buildProductionAssets({ root });
  const style = manifest.assets["/styles.css"];
  const counter = manifest.assets["/_aster/app/components/counter.js"];

  assert.equal(manifest.outputDirectory, ".aster/output");
  assert.match(style.url, /^\/_aster\/assets\/public\/styles\.[a-f0-9]{10}\.css$/);
  assert.match(counter.url, /^\/_aster\/assets\/app\/components\/counter\.[a-f0-9]{10}\.js$/);
  assert.equal(style.file.startsWith("assets/public/"), true);
  assert.equal(counter.file.startsWith("assets/app/components/"), true);
  assert.equal((await readFile(path.join(root, manifest.outputDirectory, style.file), "utf8")), ".hero{color:teal;}");
  assert.match(await readFile(path.join(root, ".aster/assets.json"), "utf8"), /"\/styles\.css"/);
});
