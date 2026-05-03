import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  assertNoFatalDiagnostics,
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
  await mkdir(path.join(root, "app/lib"), { recursive: true });
  await writeFile(path.join(root, "app/layout.js"), "export default function Layout({ children }) { return children; }\n");
  await writeFile(path.join(root, "app/error.js"), "export default function ErrorBoundary() { return 'root error'; }\n");
  await writeFile(path.join(root, "app/loading.js"), "export default function LoadingBoundary() { return 'root loading'; }\n");
  await writeFile(path.join(root, "app/lib/typed-message.ts"), "type Message = string;\nexport const typedMessage: Message = 'Hello TS';\n");
  await writeFile(path.join(routes, "blog/layout.js"), "export default function BlogLayout({ children }) { return children; }\n");
  await writeFile(path.join(routes, "blog/error.jsx"), "export default function BlogError() { return <main>blog error</main>; }\n");
  await writeFile(path.join(routes, "blog/loading.jsx"), "export default function BlogLoading() { return <main>blog loading</main>; }\n");
  await writeFile(path.join(routes, "index.page.js"), "export function GET() { return 'home'; }\n");
  await writeFile(
    path.join(routes, "typed.page.ts"),
    "import { typedMessage } from '../lib/typed-message';\nexport function GET(): string { return typedMessage; }\n"
  );
  await writeFile(
    path.join(routes, "contact.page.js"),
    `import { action } from "${coreUrl}";\nexport const intent = { actions: ["sendMessage"], security: { maxBody: "32kb" } };\nexport const sendMessage = action(async () => ({ ok: true }));\nexport function GET() { return 'contact'; }\n`
  );
  await writeFile(
    path.join(routes, "jsx.page.jsx"),
    `import { page } from "${coreUrl}";\nfunction Card({ children }) { return <article className="card">{children}</article>; }\nexport function GET() { return page(<main><Card>Hello JSX</Card></main>, { title: "JSX" }); }\n`
  );
  await writeFile(
    path.join(routes, "typed-jsx.page.tsx"),
    `import { page } from "${coreUrl}";\ntype Label = string;\nexport function GET(): unknown { const label: Label = "Hello TSX"; return page(<main>{label}</main>, { title: label }); }\n`
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
  assert.equal(routePatternFromFile(path.join(routes, "typed.page.ts"), routes), "/typed");
  assert.equal(routePatternFromFile(path.join(routes, "typed-jsx.page.tsx"), routes), "/typed-jsx");
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
  assert.equal(routes.get("/typed")?.module.GET(), "Hello TS");
  assert.match(routes.get("/typed")?.filePath, /typed\.page\.ts$/);
  assert.match(routes.get("/typed-jsx")?.filePath, /typed-jsx\.page\.tsx$/);
  assert.match(routes.get("/typed-jsx")?.module.GET().body.toString(), /Hello TSX/);
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

test("assertNoFatalDiagnostics fails unsafe graph and intent diagnostics", () => {
  assert.throws(
    () =>
      assertNoFatalDiagnostics([
        {
          level: "warning",
          code: "client-imports-server-module",
          message: "Client island imports server code.",
          importer: "app/components/counter.js",
          imported: "app/lib/server.js"
        }
      ]),
    /client-imports-server-module/
  );

  assert.throws(
    () =>
      assertNoFatalDiagnostics([
        {
          level: "warning",
          code: "undeclared-route-action",
          message: "Action not declared.",
          route: "app/routes/contact.page.js",
          action: "deleteMessage"
        }
      ]),
    /undeclared-route-action/
  );

  assert.doesNotThrow(() =>
    assertNoFatalDiagnostics([
      {
        level: "warning",
        code: "informational",
        message: "This remains non-fatal."
      }
    ])
  );
});

test("buildProductionAssets emits hashed public and app browser assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-assets-"));

  await mkdir(path.join(root, "public"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "public/styles.css"), "/* dev */\n.hero { color: teal; }\n");
  await writeFile(path.join(root, "public/app.js"), "// public app\nconst   answer   =   42;\nconsole.log(answer);\n");
  await writeFile(path.join(root, "app/components/label.ts"), "// label helper\nexport   const   label: string   =   'Count';\n");
  await writeFile(
    path.join(root, "app/components/counter.ts"),
    "/* counter island */\nimport   { label }   from   './label';\n\nexport default function hydrate(host: HTMLElement): string {\n  return   label;\n}\n"
  );

  const manifest = await buildProductionAssets({ root });
  const style = manifest.assets["/styles.css"];
  const publicScript = manifest.assets["/app.js"];
  const counter = manifest.assets["/_aster/app/components/counter.ts"];
  const label = manifest.assets["/_aster/app/components/label.ts"];
  const publicScriptOutput = await readFile(path.join(root, manifest.outputDirectory, publicScript.file), "utf8");
  const counterOutput = await readFile(path.join(root, manifest.outputDirectory, counter.file), "utf8");
  const labelOutput = await readFile(path.join(root, manifest.outputDirectory, label.file), "utf8");

  assert.equal(manifest.outputDirectory, ".aster/output");
  assert.match(style.url, /^\/_aster\/assets\/public\/styles\.[a-f0-9]{10}\.css$/);
  assert.match(publicScript.url, /^\/_aster\/assets\/public\/app\.[a-f0-9]{10}\.js$/);
  assert.match(counter.url, /^\/_aster\/assets\/app\/components\/counter\.[a-f0-9]{10}\.js$/);
  assert.match(label.url, /^\/_aster\/assets\/app\/components\/label\.[a-f0-9]{10}\.js$/);
  assert.equal(style.file.startsWith("assets/public/"), true);
  assert.equal(counter.file.startsWith("assets/app/components/"), true);
  assert.equal((await readFile(path.join(root, manifest.outputDirectory, style.file), "utf8")), ".hero{color:teal;}");
  assert.doesNotMatch(publicScriptOutput, /public app/);
  assert.match(publicScriptOutput, /const answer=42;/);
  assert.doesNotMatch(counterOutput, /counter island/);
  assert.doesNotMatch(counterOutput, / {2,}/);
  assert.match(counterOutput, new RegExp(`import\\{label\\}from '${label.url.replaceAll("/", "\\/")}'`));
  assert.equal(labelOutput, "export const label='Count';");
  assert.deepEqual(manifest.graph.modules, ["app/components/counter.ts", "app/components/label.ts"]);
  assert.match(await readFile(path.join(root, ".aster/assets.json"), "utf8"), /"\/styles\.css"/);
  assert.match(await readFile(path.join(root, ".aster/graph.json"), "utf8"), /"client"/);
});

test("createModuleGraph traces server and client dependencies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-module-graph-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await mkdir(path.join(root, "app/lib"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await writeFile(path.join(root, "app/lib/message.ts"), "type Message = string;\nexport const message: Message = 'from shared server module';\n");
  await writeFile(path.join(root, "app/lib/unused.js"), "export const unused = true;\n");
  await writeFile(path.join(root, "app/components/label.ts"), "export const label: string = 'Count';\n");
  await writeFile(path.join(root, "app/components/counter.ts"), "import { label } from './label';\nexport default () => label;\n");
  await writeFile(
    path.join(root, "app/routes/index.page.ts"),
    `import { page } from "${coreUrl}";
import { message } from "../lib/message";
export function GET(): unknown {
  return page(message);
}
`
  );

  const graph = await createModuleGraph({ root });

  assert.deepEqual(graph.server.modules.map((module) => module.id), [
    "app/lib/message.ts",
    "app/routes/index.page.ts"
  ]);
  assert.deepEqual(graph.client.modules.map((module) => module.id), [
    "app/components/counter.ts",
    "app/components/label.ts"
  ]);
  assert.equal(graph.server.modules.some((module) => module.id === "app/lib/unused.js"), false);
  assert.deepEqual(graph.server.modules.find((module) => module.id === "app/routes/index.page.ts")?.imports, [
    {
      specifier: "../lib/message",
      resolved: "app/lib/message.ts"
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
  await writeFile(path.join(root, "app/lib/message.ts"), "type Message = string;\nexport const message: Message = 'Built TSX';\n");
  await writeFile(path.join(root, "app/lib/unused.js"), "export const unused = true;\n");
  await writeFile(path.join(root, "app/components/counter.js"), "export default function hydrate() {}\n");
  await writeFile(
    path.join(root, "app/routes/typed.page.tsx"),
    `import { page } from "${coreUrl}";
import { message } from "../lib/message";
export function GET(): unknown {
  return page(<main>{message}</main>, { title: "Built" });
}
`
  );

  const manifest = await buildServerOutput({ root });
  const routeOutput = await readFile(path.join(root, ".aster/output/server/app/routes/typed.page.js"), "utf8");
  const sharedOutput = await readFile(path.join(root, ".aster/output/server/app/lib/message.js"), "utf8");
  const copiedCore = await readFile(path.join(root, ".aster/output/server/packages/aster-core/src/index.js"), "utf8");

  assert.equal(manifest.serverRoot, "server");
  assert.deepEqual(manifest.files, [
    {
      source: "app/lib/message.ts",
      file: "server/app/lib/message.js"
    },
    {
      source: "app/routes/typed.page.tsx",
      file: "server/app/routes/typed.page.js"
    }
  ]);
  assert.match(routeOutput, /__asterJsx\("main"/);
  assert.match(routeOutput, /from "\.\.\/lib\/message\.js"/);
  assert.doesNotMatch(routeOutput, /: unknown/);
  assert.match(routeOutput, /packages\/aster-core\/src\/index\.js/);
  assert.doesNotMatch(routeOutput, /file:\/\//);
  assert.match(sharedOutput, /Built TSX/);
  assert.doesNotMatch(sharedOutput, /: Message/);
  await assert.rejects(
    () => readFile(path.join(root, ".aster/output/server/app/lib/unused.js"), "utf8"),
    /ENOENT/
  );
  assert.deepEqual(manifest.graph.modules, ["app/lib/message.ts", "app/routes/typed.page.tsx"]);
  assert.match(copiedCore, /export \{ action/);
  assert.match(await readFile(path.join(root, ".aster/server.json"), "utf8"), /"serverRoot": "server"/);
});
