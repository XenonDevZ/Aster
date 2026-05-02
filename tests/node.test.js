import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { buildProductionAssets, buildServerOutput } from "../packages/aster-compiler/src/index.js";
import { createNodeHandler } from "../packages/aster-node/src/index.js";

test("node adapter serves production-style pages and assets", async () => {
  const handler = await createNodeHandler({ root: "examples/blog" });
  const homeResponse = await handler(new Request("http://example.test/"));
  const homeBody = await homeResponse.text();

  assert.equal(homeResponse.status, 200);
  assert.equal(homeResponse.headers.get("x-aster-adapter"), "node");
  assert.equal(homeResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(homeResponse.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(homeResponse.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(homeBody, /HTML-first apps with interactive islands/);
  assert.match(homeBody, /<meta name="theme-color" content="#1f5f69">/);
  assert.match(homeBody, /window\.aster/);
  assert.doesNotMatch(homeBody, /data-aster-dev-reload/);

  const jsxResponse = await handler(new Request("http://example.test/jsx"));
  const jsxBody = await jsxResponse.text();

  assert.equal(jsxResponse.status, 200);
  assert.match(jsxBody, /Write page UI with components/);

  const errorResponse = await handler(new Request("http://example.test/blog/broken"));
  const errorBody = await errorResponse.text();

  assert.equal(errorResponse.status, 500);
  assert.match(errorBody, /The blog route recovered/);
  assert.match(errorBody, /The blog loader failed on purpose/);

  const deferredResponse = await handler(new Request("http://example.test/deferred"));
  const deferredBody = await deferredResponse.text();

  assert.equal(deferredResponse.status, 200);
  assert.match(deferredBody, /Loading deferred data/);
  assert.match(deferredBody, /Comment stream resolved/);

  const actionResponse = await handler(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23sendMessage", {
      method: "POST",
      headers: { origin: "http://example.test" },
      body: new URLSearchParams({ name: "Ada", topic: "Node" })
    })
  );

  assert.equal(actionResponse.status, 303);
  assert.equal(actionResponse.headers.get("location"), "/contact?sent=Ada&topic=Node");

  const forgedActionResponse = await handler(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23sendMessage", {
      method: "POST",
      headers: { origin: "https://evil.test" },
      body: new URLSearchParams({ name: "Ada", topic: "Node" })
    })
  );

  assert.equal(forgedActionResponse.status, 403);

  const assetResponse = await handler(new Request("http://example.test/styles.css"));
  const assetBody = await assetResponse.text();

  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("x-content-type-options"), "nosniff");
  assert.match(assetResponse.headers.get("content-type"), /text\/css/);
  assert.match(assetBody, /\.hero/);
});

test("node adapter rewrites HTML to hashed build assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-node-assets-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await mkdir(path.join(root, "app/components"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "public/styles.css"), ".hero { color: teal; }\n");
  await writeFile(path.join(root, "app/components/counter.js"), "export default function hydrate() {}\n");
  await writeFile(
    path.join(root, "app/routes/index.page.js"),
    `import { html, island, page } from "${coreUrl}";
export function GET() {
  return page(html\`<main class="hero">\${island("/_aster/app/components/counter.js", {}, html\`<button>Count</button>\`)}</main>\`, {
    title: "Built assets",
    head: html\`<link rel="stylesheet" href="/styles.css" />\`
  });
}
`
  );

  await buildProductionAssets({ root });

  const handler = await createNodeHandler({ root });
  const response = await handler(new Request("http://example.test/"));
  const body = await response.text();
  const styleUrl = body.match(/href="([^"]+styles\.[a-f0-9]{10}\.css)"/)?.[1];
  const componentUrl = body.match(/data-component="([^"]+counter\.[a-f0-9]{10}\.js)"/)?.[1];

  assert.equal(response.status, 200);
  assert.ok(styleUrl);
  assert.ok(componentUrl);
  assert.doesNotMatch(body, /href="\/styles\.css"/);
  assert.doesNotMatch(body, /data-component="\/_aster\/app\/components\/counter\.js"/);

  const styleResponse = await handler(new Request(`http://example.test${styleUrl}`));
  const componentResponse = await handler(new Request(`http://example.test${componentUrl}`));
  const rawComponentResponse = await handler(new Request("http://example.test/_aster/app/components/counter.js"));

  assert.equal(styleResponse.status, 200);
  assert.equal(styleResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await styleResponse.text(), ".hero{color:teal;}");
  assert.equal(componentResponse.status, 200);
  assert.equal(rawComponentResponse.status, 404);
});

test("node adapter prefers built server output over raw source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-node-server-output-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;
  const routeFile = path.join(root, "app/routes/index.page.js");

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "public/styles.css"), ".hero { color: teal; }\n");
  await writeFile(
    routeFile,
    `import { html, page } from "${coreUrl}";
export function GET() {
  return page(html\`<main class="hero">Built server output</main>\`, {
    title: "Built server",
    head: html\`<link rel="stylesheet" href="/styles.css" />\`
  });
}
`
  );

  await buildProductionAssets({ root });
  await buildServerOutput({ root });
  await writeFile(
    routeFile,
    `import { html, page } from "${coreUrl}";
export function GET() {
  return page(html\`<main>Raw source changed after build</main>\`);
}
`
  );

  const handler = await createNodeHandler({ root, requireBuild: true });
  const response = await handler(new Request("http://example.test/"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Built server output/);
  assert.doesNotMatch(body, /Raw source changed after build/);
  assert.match(body, /\/_aster\/assets\/public\/styles\.[a-f0-9]{10}\.css/);
});

test("node adapter requireBuild fails before build output exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aster-node-require-build-"));
  const coreUrl = pathToFileURL(path.resolve("packages/aster-core/src/index.js")).href;

  await mkdir(path.join(root, "app/routes"), { recursive: true });
  await writeFile(
    path.join(root, "app/routes/index.page.js"),
    `import { page } from "${coreUrl}";
export function GET() {
  return page("not built yet");
}
`
  );

  await assert.rejects(
    () => createNodeHandler({ root, requireBuild: true }),
    /Aster server manifest was not found.*Run "aster build" before "aster start"/
  );
});
