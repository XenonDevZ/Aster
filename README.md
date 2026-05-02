# Aster Framework

Aster is an experimental, server-first web framework for building HTML-first applications with selective interactivity. It uses Fetch-style `Request` and `Response` objects, discovers routes from files, renders complete documents on the server, and hydrates only the browser islands you explicitly mark.

The current goal is to explore what a small compiler-driven framework can provide without hiding the platform:

```text
Send HTML first. Stream when useful. Hydrate only what needs browser state.
```

## Highlights

- File-based routing with dynamic, catch-all, and route-group segments.
- Nested layouts from `app/layout.js` and route segment `layout.js` files.
- Server-rendered pages with metadata/head management.
- Route loaders, streaming SSR, deferred loader data, and loading boundaries.
- Route error boundaries with nearest-boundary recovery.
- JSX route and boundary compilation for `.jsx` files.
- Interactive islands through declarative `<aster-island>` markers.
- Same-origin client navigation for server-rendered pages.
- Server actions for HTML forms through generated `/_aster/action/...` endpoints.
- Production action hardening: CSRF checks, body-size limits, and safe redirects.
- Development server with public asset serving and live reload.
- Production build output with hashed assets and a copied server runtime.
- Node preview and production start commands.

## Workspace

```text
packages/
  aster-core/      Request pipeline, HTML helpers, router, pages, islands, actions.
  aster-compiler/  File-route discovery, JSX lowering, hashed assets, server output.
  aster-dev/       Dependency-free development server and live reload.
  aster-node/      Node adapter for preview and production serving.
  aster-cli/       CLI commands for dev, routes, build, preview, and start.

examples/blog/     Example SSR app using routes, layouts, JSX, streaming, actions, and islands.
tests/             Node test suite for core, compiler, dev, and Node adapter behavior.
```

## Quick Start

```bash
npm test
npm run dev:example
```

Open `http://127.0.0.1:3000`.

Useful commands:

```bash
npm run routes:example
npm run build:example
npm run preview:example
npm run start:example
```

`preview` can serve source or built output. `start` requires a completed production build.

## CLI

```text
aster dev [root] [--host 127.0.0.1] [--port 3000]
aster routes [root]
aster build [root]
aster preview [root] [--host 127.0.0.1] [--port 4173]
aster start [root] [--host 127.0.0.1] [--port 3000]
```

Command summary:

```text
dev      Starts the live development server.
routes   Prints the discovered route manifest.
build    Emits route metadata, hashed assets, and server deploy output.
preview  Starts the Node adapter, using build output when present.
start    Starts the Node adapter in production mode and requires build output.
```

## Route Model

Routes live in `app/routes` and use `.page.js`, `.page.mjs`, `.route.js`, `.route.mjs`, `.page.jsx`, or `.route.jsx`.

```text
app/routes/index.page.js             -> /
app/routes/blog/[slug].page.js       -> /blog/:slug
app/routes/docs/[...rest].page.js    -> /docs/*rest
app/routes/(admin)/dashboard.page.js -> /dashboard
```

Route modules export HTTP method handlers:

```js
import { html, page } from "@aster/core";

export async function GET({ params }) {
  return page(html`<h1>${params.slug}</h1>`, {
    title: "Blog post"
  });
}
```

If no explicit method export exists, Aster uses the module default export as a `GET` handler.

## Layouts

Layouts wrap matched pages from the leaf route back to the root layout.

```text
app/layout.js
app/routes/blog/layout.js
app/routes/blog/[slug].page.js
```

```js
import { html } from "@aster/core";

export default function Layout({ children }) {
  return html`<main class="shell">${children}</main>`;
}
```

## Loaders And Metadata

Routes can export `load()` and `meta()`. Loader data is passed to handlers, layouts, metadata functions, and error/loading boundaries.

```js
export async function load({ params }) {
  return {
    post: await db.posts.find(params.slug)
  };
}

export function meta({ data }) {
  return {
    title: `${data.post.title} | Aster`,
    description: data.post.excerpt,
    meta: [{ property: "og:title", content: data.post.title }]
  };
}

export function GET({ data }) {
  return page(html`<article>${data.post.title}</article>`);
}
```

Metadata merges from root layout to nested layout to route. Later route metadata can override earlier titles while preserving compatible tags.

## Islands

Server routes can emit islands for browser-only interactivity.

```js
import { html, island } from "@aster/core";

export function GET() {
  return page(html`
    ${island(
      "/_aster/app/components/counter.js",
      { start: 3 },
      html`<button type="button">Count: 3</button>`
    )}
  `);
}
```

The browser module exports a hydrator:

```js
export default function hydrate(host, props) {
  let count = Number(props.start ?? 0);
  const button = host.querySelector("button");

  button.addEventListener("click", () => {
    count += 1;
    button.textContent = `Count: ${count}`;
  });
}
```

In development, island modules are served from `/_aster/app/...`. After `aster build`, production HTML is rewritten to hashed URLs under `/_aster/assets/...`.

## Server Actions

Server actions let forms call server-side functions without a separate API route.

```js
import { action, html, page, redirect } from "@aster/core";

export const sendMessage = action(async ({ formData }) => {
  const name = formData.get("name");
  return redirect(`/contact?sent=${encodeURIComponent(name)}`, 303);
});

export function GET() {
  return page(html`
    <form method="post" action="${sendMessage}">
      <input name="name" required />
      <button type="submit">Send</button>
    </form>
  `);
}
```

The compiler binds actions to generated `/_aster/action/...` endpoints. Production actions use strict same-origin CSRF checks in the Node adapter, enforce an action body limit, and return local-only redirects by default.

External redirects must be explicit:

```js
redirect("https://docs.example/guide", 302, { allowExternal: true });
```

## Streaming And Deferred Data

Routes can stream page bodies:

```js
import { html, page, stream } from "@aster/core";

async function* body() {
  yield html`<p>Shell-ready content</p>`;
  yield fetchSlowData().then((data) => html`<p>${data.title}</p>`);
}

export function GET() {
  return page(stream(body()), {
    title: "Streaming page"
  });
}
```

Deferred loader data streams fallback UI first, then sends resolved HTML for browser replacement:

```js
import { defer, html, page, renderDeferred } from "@aster/core";

export function load() {
  return {
    comments: defer(getComments(), { name: "comments" })
  };
}

export function GET({ data }) {
  return page(html`
    ${renderDeferred(data.comments, (comments) => html`<p>${comments.length} comments</p>`)}
  `);
}
```

If a matching `loading.js` or `loading.jsx` exists, Aster uses it as the deferred fallback.

## JSX

Aster compiles `.jsx` route, layout, error, and loading files into runtime calls before importing them.

```jsx
import { page } from "@aster/core";

function Card({ title, children }) {
  return (
    <article className="post">
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  );
}

export function GET() {
  return page(
    <main>
      <Card title="Hello">Rendered by Aster JSX.</Card>
    </main>,
    { title: "JSX page" }
  );
}
```

The JSX transform is framework-local and dependency-free.

## Client Navigation

Aster includes a small browser runtime that intercepts same-origin link clicks, fetches the next server-rendered document, swaps the page, updates history, and lets islands hydrate after navigation.

Opt out per link or container:

```html
<a href="/heavy-report" data-aster-reload>Open with a full reload</a>
```

Programmatic navigation is available in the browser:

```js
window.aster.navigate("/contact");
```

## Error Boundaries

Add `error.js` or `error.jsx` beside a layout or route segment. When a route loader, handler, metadata function, or layout throws, Aster renders the nearest boundary.

```jsx
import { page } from "@aster/core";

export default function BlogError({ error, params }) {
  return page(
    <main>
      <h1>Could not render {params.slug}</h1>
      <p>{error.message}</p>
    </main>,
    { status: 500, title: "Blog error" }
  );
}
```

## Production Build

Run:

```bash
npm run build:example
```

The build writes:

```text
examples/blog/.aster/manifest.json
examples/blog/.aster/assets.json
examples/blog/.aster/server.json
examples/blog/.aster/output/assets/
examples/blog/.aster/output/server/
```

Build output includes:

- A serializable route manifest.
- Hashed public assets and browser island modules.
- CSS minification for production asset output.
- A server output folder with copied route/layout/boundary modules.
- Compiled `.jsx` server files.
- A copied Aster core runtime used by the built server output.

Production serving:

```bash
npm run start:example
```

`aster start` requires `.aster/server.json` and `.aster/assets.json`. If they are missing, it fails with a clear instruction to run `aster build`.

## Runtime Hardening

The Node adapter applies production-oriented defaults:

- `x-content-type-options: nosniff`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-frame-options: SAMEORIGIN`
- `cross-origin-opener-policy: same-origin`
- restrictive `permissions-policy`
- baseline CSP compatible with Aster's inline runtime scripts

Server actions also use:

- strict same-origin CSRF checks in production Node mode
- configurable `allowedActionOrigins`
- configurable `maxActionBodySize`
- safe local redirects by default

## Example Routes

```text
/                         SSR home page with an island
/blog/compiler-driven-web Nested layout route
/jsx                      JSX route compilation
/deferred                 Deferred loader data with loading boundary
/contact                  Server action form
/stream                   Streaming SSR page
/blog/broken              Error boundary recovery
```

## Status

Aster is still a prototype. It now has a serious framework shape, but it is not yet a drop-in replacement for established production frameworks.

Current limitations:

- No TypeScript compiler integration yet.
- No third-party dependency bundling for server output.
- JavaScript asset minification is not implemented.
- The CSP still allows inline scripts because the runtime is injected inline.
- Only the Node adapter exists today.

Near-term roadmap:

- TypeScript route compilation.
- Server/client module graph splitting.
- Stronger CSP through nonces or externalized runtime scripts.
- Deployment adapters for workers and edge runtimes.
- Production diagnostics, tracing, and structured logs.

## License

This repository is a local framework prototype and does not currently declare a license.
