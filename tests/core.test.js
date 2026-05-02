import assert from "node:assert/strict";
import test from "node:test";
import {
  action,
  bindAction,
  createApp,
  defer,
  Fragment,
  html,
  island,
  jsx,
  page,
  redirect,
  renderDeferred,
  stream
} from "../packages/aster-core/src/index.js";

test("html escapes interpolated values and preserves trusted html", () => {
  const name = "<script>alert(1)</script>";
  const output = html`<p>${name}</p>${html`<strong>safe</strong>`}`.toString();

  assert.equal(output, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><strong>safe</strong>");
});

test("jsx renders elements, fragments, components, and server-safe attributes", () => {
  function Field({ label, children }) {
    return jsx("label", {
      className: "field",
      htmlFor: "name",
      style: { fontWeight: 700, borderColor: "#123456" },
      children: [
        jsx("span", { children: label }),
        children,
        jsx(Fragment, { children: ["Help ", jsx("strong", { children: "text" })] })
      ]
    });
  }

  const output = jsx(Field, {
    label: "Name",
    children: jsx("input", {
      id: "name",
      disabled: true,
      onClick() {}
    })
  }).toString();

  assert.match(output, /<label class="field" for="name" style="font-weight:700;border-color:#123456">/);
  assert.match(output, /<span>Name<\/span>/);
  assert.match(output, /<input id="name" disabled>/);
  assert.doesNotMatch(output, /onClick/);
  assert.match(output, /Help <strong>text<\/strong>/);
});

test("app matches dynamic routes, renders documents, and runs middleware", async () => {
  const app = createApp({
    routes: [
      {
        pattern: "/blog/:slug",
        module: {
          GET({ params, locals }) {
            return page(html`<main><h1>${params.slug}</h1><p>${locals.marker}</p></main>`, {
              title: "Post"
            });
          }
        }
      }
    ],
    middleware: [
      async (context, next) => {
        context.locals.marker = "middleware-ran";
        const response = await next();
        response.headers.set("x-test-middleware", "yes");
        return response;
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/blog/hello%20world"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-test-middleware"), "yes");
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /<title>Post<\/title>/);
  assert.match(body, /hello world/);
  assert.match(body, /middleware-ran/);
  assert.match(body, /customElements\.define/);
  assert.match(body, /window\.aster/);
  assert.match(body, /aster:navigate/);
});

test("app returns 405 with allow header when method is unsupported", async () => {
  const app = createApp({
    routes: [
      {
        pattern: "/submit",
        module: {
          GET() {
            return "read";
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/submit", { method: "POST" }));
  const body = await response.json();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(body.error, "Method Not Allowed");
});

test("app wraps page bodies with nested layouts from leaf to root", async () => {
  const app = createApp({
    routes: [
      {
        pattern: "/docs/:slug",
        layouts: [
          {
            id: "root",
            module: {
              default({ children }) {
                return html`<div data-layout="root">${children}</div>`;
              }
            }
          },
          {
            id: "docs",
            module: {
              default({ children, params }) {
                return html`<section data-layout="docs" data-slug="${params.slug}">${children}</section>`;
              }
            }
          }
        ],
        module: {
          GET({ params }) {
            return page(html`<article>${params.slug}</article>`, {
              title: "Nested"
            });
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/docs/layouts"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /<title>Nested<\/title>/);
  assert.match(
    body,
    /<div data-layout="root">\s*<section data-layout="docs" data-slug="layouts">\s*<article>layouts<\/article>\s*<\/section>\s*<\/div>/
  );
});

test("app passes loader data to handlers, layouts, and metadata", async () => {
  const app = createApp({
    routes: [
      {
        pattern: "/posts/:slug",
        layouts: [
          {
            id: "root",
            module: {
              default({ children, data }) {
                return html`<main data-layout="root"><p>${data.post.title}</p>${children}</main>`;
              },
              meta() {
                return {
                  description: "Layout description",
                  meta: [{ name: "layout-meta", content: "present" }]
                };
              }
            }
          }
        ],
        module: {
          async load({ params }) {
            return {
              post: {
                title: `Loaded ${params.slug}`,
                excerpt: `Excerpt for ${params.slug}`
              }
            };
          },
          meta({ data }) {
            return {
              title: `${data.post.title} | Test`,
              description: data.post.excerpt,
              meta: [{ property: "og:title", content: data.post.title }],
              links: [{ rel: "canonical", href: `/posts/${data.post.title}` }]
            };
          },
          GET({ data }) {
            return page(html`<article><h1>${data.post.title}</h1></article>`, {
              title: "Fallback title"
            });
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/posts/alpha"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /<title>Loaded alpha \| Test<\/title>/);
  assert.match(body, /<meta name="description" content="Layout description">/);
  assert.match(body, /<meta name="description" content="Excerpt for alpha">/);
  assert.match(body, /<meta name="layout-meta" content="present">/);
  assert.match(body, /<meta property="og:title" content="Loaded alpha">/);
  assert.match(body, /<link rel="canonical" href="\/posts\/Loaded alpha">/);
  assert.match(body, /<main data-layout="root"><p>Loaded alpha<\/p><article><h1>Loaded alpha<\/h1><\/article><\/main>/);
});

test("app renders the nearest error boundary when a route fails", async () => {
  const app = createApp({
    routes: [
      {
        pattern: "/blog/:slug",
        errorBoundaries: [
          {
            id: "root-error",
            module: {
              default({ error }) {
                return page(html`<main><h1>Root handled ${error.message}</h1></main>`, {
                  title: "Root error",
                  status: 500
                });
              }
            }
          },
          {
            id: "blog-error",
            module: {
              meta() {
                return {
                  title: "Blog boundary meta"
                };
              },
              default({ error, params }) {
                return page(html`<main><h1>Blog handled ${params.slug}</h1><p>${error.message}</p></main>`, {
                  title: "Blog error",
                  status: 500
                });
              }
            }
          }
        ],
        module: {
          load() {
            throw new Error("loader exploded");
          },
          GET() {
            return page(html`<main>unreachable</main>`);
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/blog/broken"));
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.match(body, /<title>Blog boundary meta<\/title>/);
  assert.match(body, /Blog handled broken/);
  assert.match(body, /loader exploded/);
  assert.doesNotMatch(body, /Root handled/);
});

test("app executes bound server actions from generated endpoints", async () => {
  const saveMessage = bindAction(
    action(async ({ formData, locals }) => ({
      ok: true,
      name: formData.get("name"),
      marker: locals.marker
    })),
    {
      id: "app/routes/contact.page.js#saveMessage",
      name: "saveMessage",
      path: "/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage",
      routeId: "app/routes/contact.page.js"
    }
  );

  const app = createApp({
    routes: [
      {
        pattern: "/contact",
        actions: [
          {
            id: saveMessage.id,
            name: saveMessage.name,
            path: saveMessage.path,
            ref: saveMessage
          }
        ],
        module: {
          GET() {
            return page(html`<form method="post" action="${saveMessage}"><input name="name" /></form>`, {
              title: "Contact"
            });
          }
        }
      }
    ],
    middleware: [
      async (context, next) => {
        context.locals.marker = "from-middleware";
        return next();
      }
    ]
  });

  const pageResponse = await app.fetch(new Request("http://example.test/contact"));
  const pageBody = await pageResponse.text();

  assert.match(pageBody, /\/_aster\/action\/app%2Froutes%2Fcontact\.page\.js%23saveMessage/);

  const response = await app.fetch(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage", {
      method: "POST",
      body: new URLSearchParams({ name: "Ada" })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    name: "Ada",
    marker: "from-middleware"
  });

  const rejected = await app.fetch(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage")
  );

  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get("allow"), "POST");
});

test("app can enforce action CSRF and body size limits", async () => {
  const saveMessage = bindAction(
    action(async ({ formData }) => ({
      ok: true,
      name: formData.get("name")
    })),
    {
      id: "app/routes/contact.page.js#saveMessage",
      name: "saveMessage",
      path: "/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage",
      routeId: "app/routes/contact.page.js"
    }
  );
  const actionUrl = "http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage";
  const app = createApp({
    actionCsrf: "strict",
    maxActionBodySize: 16,
    routes: [
      {
        pattern: "/contact",
        actions: [
          {
            id: saveMessage.id,
            name: saveMessage.name,
            path: saveMessage.path,
            ref: saveMessage
          }
        ],
        module: {
          GET() {
            return page(html`<form method="post" action="${saveMessage}"></form>`);
          }
        }
      }
    ]
  });

  const missingOrigin = await app.fetch(
    new Request(actionUrl, {
      method: "POST",
      body: new URLSearchParams({ name: "Ada" })
    })
  );

  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).reason, "Missing action origin");

  const forgedOrigin = await app.fetch(
    new Request(actionUrl, {
      method: "POST",
      headers: { origin: "https://evil.test" },
      body: new URLSearchParams({ name: "Ada" })
    })
  );

  assert.equal(forgedOrigin.status, 403);

  const accepted = await app.fetch(
    new Request(actionUrl, {
      method: "POST",
      headers: { origin: "http://example.test" },
      body: new URLSearchParams({ name: "Ada" })
    })
  );

  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, name: "Ada" });

  const oversized = await app.fetch(
    new Request(actionUrl, {
      method: "POST",
      headers: { origin: "http://example.test" },
      body: new URLSearchParams({ name: "0123456789012345" })
    })
  );

  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).limit, 16);
});

test("app enforces declared route action intent", async () => {
  const saveMessage = bindAction(
    action(async ({ formData }) => ({
      ok: true,
      name: formData.get("name")
    })),
    {
      id: "app/routes/contact.page.js#saveMessage",
      name: "saveMessage",
      path: "/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage",
      routeId: "app/routes/contact.page.js"
    }
  );
  const deleteMessage = bindAction(
    action(async () => ({
      ok: true
    })),
    {
      id: "app/routes/contact.page.js#deleteMessage",
      name: "deleteMessage",
      path: "/_aster/action/app%2Froutes%2Fcontact.page.js%23deleteMessage",
      routeId: "app/routes/contact.page.js"
    }
  );
  const app = createApp({
    routes: [
      {
        pattern: "/contact",
        intent: {
          actions: ["saveMessage"],
          security: {
            maxBody: "32kb"
          }
        },
        actions: [
          {
            id: saveMessage.id,
            name: saveMessage.name,
            path: saveMessage.path,
            ref: saveMessage
          },
          {
            id: deleteMessage.id,
            name: deleteMessage.name,
            path: deleteMessage.path,
            ref: deleteMessage
          }
        ],
        module: {
          GET() {
            return page(html`<form method="post" action="${saveMessage}"></form>`);
          }
        }
      }
    ]
  });

  const allowed = await app.fetch(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23saveMessage", {
      method: "POST",
      body: new URLSearchParams({ name: "Ada" })
    })
  );
  const denied = await app.fetch(
    new Request("http://example.test/_aster/action/app%2Froutes%2Fcontact.page.js%23deleteMessage", {
      method: "POST",
      body: new URLSearchParams({ name: "Ada" })
    })
  );
  const deniedBody = await denied.json();

  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ok: true, name: "Ada" });
  assert.equal(denied.status, 403);
  assert.equal(deniedBody.reason, "Action is not declared in route intent");
  assert.equal(deniedBody.action, "deleteMessage");
});

test("redirect helpers default to local safe targets", () => {
  const local = redirect("/contact?sent=Ada", 303);
  const external = redirect("https://evil.test/phish");
  const script = redirect("javascript:alert(1)");
  const withFallback = redirect("https://evil.test/phish", 302, { fallback: "/login" });
  const allowedExternal = redirect("https://docs.example/guide", 302, { allowExternal: true });

  assert.equal(local.status, 303);
  assert.equal(local.headers.get("location"), "/contact?sent=Ada");
  assert.equal(external.headers.get("location"), "/");
  assert.equal(script.headers.get("location"), "/");
  assert.equal(withFallback.headers.get("location"), "/login");
  assert.equal(allowedExternal.headers.get("location"), "https://docs.example/guide");
});

test("app streams page documents without waiting for every body chunk", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  async function* body() {
    yield html`<section>first streamed chunk</section>`;
    await gate;
    yield html`<section>second streamed chunk</section>`;
  }

  const app = createApp({
    routes: [
      {
        pattern: "/stream",
        layouts: [
          {
            id: "root",
            module: {
              default({ children }) {
                return html`<main data-layout="root">${children}</main>`;
              }
            }
          }
        ],
        module: {
          GET() {
            return page(stream(body()), {
              title: "Stream"
            });
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/stream"));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partial = "";

  while (!partial.includes("first streamed chunk")) {
    const next = await reader.read();
    assert.equal(next.done, false);
    partial += decoder.decode(next.value, { stream: true });
  }

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(partial, /<!doctype html>/);
  assert.match(partial, /data-layout="root"/);
  assert.doesNotMatch(partial, /second streamed chunk/);

  release();

  let rest = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    rest += decoder.decode(next.value, { stream: true });
  }

  assert.match(rest, /second streamed chunk/);
  assert.match(rest, /customElements\.define/);
});

test("app streams deferred loader data with loading boundary fallback", async () => {
  let release;
  const slowValue = new Promise((resolve) => {
    release = resolve;
  });

  const app = createApp({
    routes: [
      {
        pattern: "/deferred",
        loadingBoundaries: [
          {
            id: "deferred-loading",
            module: {
              default() {
                return html`<section class="loading">Loading deferred data</section>`;
              }
            }
          }
        ],
        module: {
          load() {
            return {
              comments: defer(slowValue, { name: "comments" })
            };
          },
          GET({ data }) {
            return page(html`<main>${renderDeferred(data.comments, (value) => html`<p>${value}</p>`)}</main>`, {
              title: "Deferred"
            });
          }
        }
      }
    ]
  });

  const response = await app.fetch(new Request("http://example.test/deferred"));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partial = "";

  while (!partial.includes("Loading deferred data")) {
    const next = await reader.read();
    assert.equal(next.done, false);
    partial += decoder.decode(next.value, { stream: true });
  }

  assert.equal(response.status, 200);
  assert.match(partial, /<aster-deferred/);
  assert.doesNotMatch(partial, /Resolved comments/);

  release("Resolved comments");

  let rest = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    rest += decoder.decode(next.value, { stream: true });
  }

  assert.match(rest, /<template data-aster-deferred=/);
  assert.match(rest, /Resolved comments/);
  assert.match(rest, /replaceWith/);
});

test("island renders a declarative hydration marker", () => {
  const marker = island("/_aster/app/components/counter.js", { start: 1 }, html`<button>Count: 1</button>`);
  const output = marker.toString();

  assert.match(output, /^<aster-island/);
  assert.match(output, /data-component="\/_aster\/app\/components\/counter\.js"/);
  assert.match(output, /data-props="%7B%22start%22%3A1%7D"/);
  assert.match(output, /<button>Count: 1<\/button>/);
});
