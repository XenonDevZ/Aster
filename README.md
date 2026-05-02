# Aster Framework

Aster is a prototype for a compiler-driven, server-first web framework. It renders pages with Fetch-style `Request` and `Response` objects, discovers routes from files, serves full HTML by default, and hydrates only explicit browser islands.

The pitch:

```text
Build full-stack JavaScript and TypeScript apps that send HTML first,
then hydrate only the components that actually need browser state.
```

## What Exists

- `@aster/core`: request pipeline, router, middleware, HTML helpers, page rendering, responses, and islands.
- `@aster/compiler`: file-route discovery, manifest generation, hashed assets, and deploy output.
- Nested layouts from `app/layout.js` and route segment `layout.js` files.
- `@aster/dev`: dependency-free Node dev server with public file serving and app module serving.
- `@aster/cli`: `dev`, `preview`, `routes`, and `build` commands.
- `examples/blog`: a small SSR app with dynamic routes and a hydrated counter island.
- Server actions for HTML forms through generated `/_aster/action/...` endpoints.
- Streaming SSR with `stream(...)` values that compose through layouts.
- JSX route modules with `.page.jsx` and `.route.jsx` compilation.
- Client-side navigation for same-origin links while preserving server-rendered pages.
- Dev live reload for files under `app/` and `public/`.
- Production-style Node adapter through `aster preview`.
- Route loaders and metadata/head management.
- Route error boundaries discovered from `error.js` / `error.jsx`.
- Deferred loader data with loading boundaries and streamed replacement.
- Production build output with hashed `public/` assets and browser island modules.
- Server deploy output that copies route/layout modules, compiles JSX server files, and rewrites runtime imports.

## Route Model

Routes live in `app/routes` and use `.page.js`, `.page.mjs`, `.route.js`, or `.route.mjs`.

```text
app/routes/index.page.js             -> /
app/routes/blog/[slug].page.js       -> /blog/:slug
app/routes/docs/[...rest].page.js    -> /docs/*rest
app/routes/(admin)/dashboard.page.js -> /dashboard
```

Layouts wrap matched page bodies from the nearest route segment outward:

```text
app/layout.js                    -> wraps every route
app/routes/blog/layout.js        -> wraps /blog routes
app/routes/blog/[slug].page.js   -> renders inside both layouts
```

```js
import { html } from "@aster/core";

export default function Layout({ children }) {
  return html`<main class="shell">${children}</main>`;
}
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

Routes can also export `load()` and `meta()`:

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

`load()` runs before the route handler, and its result is available as `context.data` in handlers, layouts, and metadata functions. Metadata merges from root layout to nested layouts to the route, with later titles winning.

## Islands

Server routes can emit an island marker:

```js
import { html, island } from "@aster/core";

island(
  "/_aster/app/components/counter.js",
  { start: 3 },
  html`<button type="button">Count: 3</button>`
);
```

The browser module exports a hydrator:

```js
export default function hydrate(host, props) {
  host.querySelector("button").addEventListener("click", () => {
    console.log(props);
  });
}
```

## Server Actions

Routes can export server actions for form submissions:

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

The compiler binds `sendMessage` to a generated endpoint and the runtime parses `FormData` before calling the action.

Production adapters run actions with same-origin CSRF checks, a default 1 MB action body limit, and local-only redirects unless you explicitly allow an external destination:

```js
import { redirect } from "@aster/core";

redirect("/contact?sent=Ada", 303);
redirect("https://docs.example/guide", 302, { allowExternal: true });
```

For deployments behind another public origin, pass `allowedActionOrigins` to the Node adapter.

## Streaming SSR

Routes can return streamed page bodies:

```js
import { html, page, stream } from "@aster/core";

async function* updates() {
  yield html`<p>Shell-ready content</p>`;
  yield fetchSlowData().then((data) => html`<p>${data.title}</p>`);
}

export function GET() {
  return page(stream(updates()), {
    title: "Streaming page"
  });
}
```

If a layout interpolates streamed `children`, the layout output becomes a stream too.

## JSX Routes

Aster can compile `.page.jsx` files during manifest creation:

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
    {
      title: "JSX page"
    }
  );
}
```

The compiler lowers JSX into Aster runtime calls before importing the route module.

## Client Navigation

Aster includes a tiny browser runtime that intercepts same-origin link clicks, fetches the next server-rendered document, swaps the page, updates history, and lets islands hydrate after navigation.

Opt out per link or container:

```html
<a href="/heavy-report" data-aster-reload>Open with a full reload</a>
```

Programmatic navigation is available in the browser:

```js
window.aster.navigate("/contact");
```

## Dev Live Reload

The dev server serves `/_aster/dev/events` as a Server-Sent Events endpoint and injects a small reload client into HTML pages. When files under `app/` or `public/` change, connected browsers reload automatically.

```bash
npm run dev:example
```

Then edit a route, layout, island, or `public/styles.css` and save.

## Node Preview

The Node adapter builds the route manifest once at startup and serves the app without dev reload injection.

```bash
npm run preview:example
```

Then open `http://127.0.0.1:4173`.

Run a production build first to emit hashed assets and an asset manifest:

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

When `.aster/assets.json` exists, the Node adapter rewrites HTML references like `/styles.css` and `/_aster/app/components/counter.js` to hashed URLs under `/_aster/assets/...`, serves those files with immutable cache headers, and stops exposing raw `/_aster/app/...` source modules.

When `.aster/server.json` exists, the Node adapter loads routes from `.aster/output/server/app` instead of the raw source `app/` directory. That makes preview closer to deployment: source files can change after `build`, but preview still runs the built server output until you build again.

## Error Boundaries

Add `error.js` or `error.jsx` beside a layout or route segment:

```text
app/error.jsx
app/routes/blog/error.jsx
app/routes/blog/[slug].page.js
```

When a route loader, handler, metadata function, or layout throws, Aster renders the nearest boundary.

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

The compiler also discovers `loading.js` / `loading.jsx` files and includes their chains in the route manifest, setting up the next layer for streaming loading UI.

## Deferred Data

Use `defer()` in a loader for slow data, then `renderDeferred()` in the page. If the route segment has `loading.jsx`, Aster uses it as the fallback until the promise resolves.

```js
import { defer, html, page, renderDeferred } from "@aster/core";

export function load() {
  return {
    comments: defer(getComments(), { name: "comments" })
  };
}

export function GET({ data }) {
  return page(html`
    <main>
      ${renderDeferred(
        data.comments,
        (comments) => html`<ul>${comments.map((comment) => html`<li>${comment}</li>`)}</ul>`
      )}
    </main>
  `);
}
```

The response streams the fallback first, then sends the resolved HTML in a template and swaps it into place in the browser.

## Try The Example

```bash
npm test
npm run routes:example
npm run dev:example
```

Then open `http://127.0.0.1:3000`.

Example routes:

```text
/                         SSR home page with an island
/blog/compiler-driven-web Nested layout route
/jsx                      JSX route compilation
/deferred                 Deferred loader data with loading boundary
/contact                  Server action form
/stream                   Streaming SSR page
```

## Next Milestones

- Add nested layouts and route-level metadata.
- Add a real compiler pass for server/client module splitting.
- Add server actions for form mutations.
- Add streaming page responses.
- Add deployment adapters for Node, workers, and edge platforms.
