import assert from "node:assert/strict";
import test from "node:test";
import { createDevHandler, createLiveReloadHub } from "../packages/aster-dev/src/index.js";

test("dev handler serves SSR pages and public assets", async () => {
  const handler = await createDevHandler({ root: "examples/blog" });
  const pageResponse = await handler(new Request("http://example.test/"));
  const pageBody = await pageResponse.text();

  assert.equal(pageResponse.status, 200);
  assert.match(pageBody, /<header class="topbar">/);
  assert.match(pageBody, /HTML-first apps with interactive islands/);
  assert.match(pageBody, /<aster-island/);
  assert.match(pageBody, /x-aster-navigation/);
  assert.match(pageBody, /window\.aster/);
  assert.match(pageBody, /data-aster-dev-reload/);
  assert.match(pageBody, /EventSource\("\/_aster\/dev\/events"\)/);

  const blogResponse = await handler(new Request("http://example.test/blog/compiler-driven-web"));
  const blogBody = await blogResponse.text();

  assert.equal(blogResponse.status, 200);
  assert.match(blogBody, /<title>Compiler-driven web apps \| Aster<\/title>/);
  assert.match(blogBody, /<meta property="og:title" content="Compiler-driven web apps">/);
  assert.match(blogBody, /<section class="blog-layout">/);
  assert.match(blogBody, /<aside class="blog-rail">/);
  assert.match(blogBody, /Compiler-driven web apps/);

  const errorResponse = await handler(new Request("http://example.test/blog/broken"));
  const errorBody = await errorResponse.text();

  assert.equal(errorResponse.status, 500);
  assert.match(errorBody, /Blog route error \| Aster/);
  assert.match(errorBody, /The blog route recovered/);
  assert.match(errorBody, /The blog loader failed on purpose/);

  const contactResponse = await handler(new Request("http://example.test/contact"));
  const contactBody = await contactResponse.text();

  assert.equal(contactResponse.status, 200);
  assert.match(contactBody, /Forms can call server code directly/);
  assert.match(contactBody, /\/_aster\/action\/app%2Froutes%2Fcontact\.page\.js%23sendMessage/);

  const actionResponse = await handler(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23sendMessage", {
      method: "POST",
      body: new URLSearchParams({ name: "Ada", topic: "Actions" })
    })
  );

  assert.equal(actionResponse.status, 303);
  assert.equal(actionResponse.headers.get("location"), "/contact?sent=Ada&topic=Actions");

  const streamResponse = await handler(new Request("http://example.test/stream"));
  const streamBody = await streamResponse.text();

  assert.equal(streamResponse.status, 200);
  assert.match(streamBody, /Streaming SSR/);
  assert.match(streamBody, /Document shell flushed/);
  assert.match(streamBody, /Data chunk resolved/);
  assert.match(streamBody, /Interactive runtime appended/);

  const deferredResponse = await handler(new Request("http://example.test/deferred"));
  const deferredBody = await deferredResponse.text();

  assert.equal(deferredResponse.status, 200);
  assert.match(deferredBody, /Loading deferred data/);
  assert.match(deferredBody, /Comment stream resolved/);
  assert.match(deferredBody, /data-aster-deferred/);

  const jsxResponse = await handler(new Request("http://example.test/jsx"));
  const jsxBody = await jsxResponse.text();

  assert.equal(jsxResponse.status, 200);
  assert.match(jsxBody, /Write page UI with components/);
  assert.match(jsxBody, /Function components/);
  assert.match(jsxBody, /Compiler route support/);

  const assetResponse = await handler(new Request("http://example.test/styles.css"));
  const assetBody = await assetResponse.text();

  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("content-type"), /text\/css/);
  assert.match(assetBody, /\.hero/);
});

test("live reload hub serves server-sent events", async () => {
  const hub = createLiveReloadHub();
  const response = hub.response();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const ready = await reader.read();

  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.match(decoder.decode(ready.value), /event: ready/);
  assert.equal(hub.clients.size, 1);

  hub.broadcast("reload", { file: "app/routes/index.page.js" });

  const reload = await reader.read();
  assert.match(decoder.decode(reload.value), /event: reload/);
  assert.match(decoder.decode(reload.value), /index\.page\.js/);

  await reader.cancel();
  assert.equal(hub.clients.size, 0);
});
