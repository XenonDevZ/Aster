# Aster Framework Roadmap

> A compiler-driven, server-first web framework with selective island hydration.

**Current version:** `v0.1`

This roadmap tracks the work needed to move Aster from a capable local prototype toward a production-ready public framework.

## Status Key

| Symbol | Meaning |
| :---: | :--- |
| ✅ | Completed |
| 🔄 | In Progress |
| 🔵 | Up Next |
| ⬜ | Planned |

## v0.2 - Developer Experience

> **Priority: Highest.** Nothing else matters if the developer experience is painful.

### TypeScript-First Surface

- ✅ Add `.d.ts` type definitions for core APIs: `page()`, `html()`, `island()`, `action()`, `stream()`, and `defer()`.
- 🔄 Compile `.ts` and `.tsx` route/server modules with Aster's lightweight source transform.
- ✅ Type the route module contract: `GET`, `POST`, `load`, `meta`, layouts, loading boundaries, and error boundaries.
- 🔄 Typed `context`, `params`, and `data` objects per route.
- 🔄 Strict types for layout `children` and nested segment props.
- 🔄 Type checking and richer TypeScript emit support beyond the current lightweight transform.
- ✅ Add a strict typecheck harness for route-module type fixtures.

### Better Error Messages

- ⬜ Named errors that tell you where things broke, for example: `load() in app/routes/blog/[slug].page.js threw: ...`.
- ⬜ In-browser dev overlay showing the error with file and line information.
- ⬜ Warn on common mistakes: wrong handler name, missing `page()` wrapper, unserializable island props.

### README And Discoverability

- ✅ Remove stale milestone sections that listed already-shipped features.
- ✅ Sync the README feature list with what currently exists.
- ⬜ Add GitHub repository topics and a short GitHub description.
- ⬜ Add a short architecture diagram explaining the request lifecycle.

## v0.3 - Islands Overhaul

> **Priority: High.** The islands API is the roughest public API in the framework right now.

### Remove The Manual Path String

- ✅ Replace `island("/_aster/app/components/counter.js", props, fallback)` with `island(Counter, props, fallback)`.
- ✅ Let the compiler resolve the module path from the component reference.
- ✅ Remove the need for developers to know or type internal `/_aster/` paths.

### Props Safety

- ⬜ Validate that island props are JSON-serializable at build time.
- ⬜ Throw a descriptive error on `Date`, class instances, functions, or circular refs.
- ⬜ Optional: evaluate richer serialization support.

### Island Communication

- ⬜ Shared signals or a tiny pub/sub bus between islands on the same page.
- ⬜ Allow islands to subscribe to shared state without a full client-side framework.
- ⬜ Document patterns for coordinating multiple islands, such as cart state plus a header count.

## v0.4 - Auth And Middleware Story

> **Priority: High.** Aster needs a clear route protection pattern before serious apps can use it comfortably.

### Session And Cookie Utilities

- ⬜ Built-in `getCookie()`, `setCookie()`, and `deleteCookie()` helpers on the request context.
- ⬜ Signed/encrypted cookie support.
- ⬜ `session()` abstraction backed by cookies or a store.

### Route-Level Auth Guards

- ⬜ A `guard()` or `protect()` export from a route or layout that runs before `load()`.
- ⬜ If the guard redirects or throws, the route never renders.
- ⬜ Guards on a layout should protect all nested routes automatically.

```js
// Example: protect all /dashboard routes
export const guard = requireAuth;
```

### Middleware Improvements

- 🔄 Middleware execution exists for pages and actions.
- ⬜ Fully documented middleware API with real-world examples.
- ⬜ Built-in patterns for auth, logging, rate limiting, and CORS.
- ⬜ Middleware composition helpers for stacking guards cleanly.

## v0.5 - Deployment Adapters

> **Priority: High.** Aster is currently Node-only, which limits where it can deploy.

| Adapter | Status | Notes |
| :--- | :---: | :--- |
| Node.js | ✅ | Exists through `aster preview` and `aster start`. |
| Vercel | ✅ | Highest-impact adapter for early users. |
| Cloudflare Workers | ⬜ | Needed for edge deployments. |
| Deno Deploy | ⬜ | Fits Aster's fetch-native design. |

Each adapter must correctly handle:

- Asset serving with hashed URLs and immutable cache headers.
- Streaming SSR responses.
- Server actions with CSRF protection.
- Public file serving.

## v0.6 - Testing Utilities

> **Priority: Medium.** Aster needs first-party helpers for testing routes and actions in isolation.

- ⬜ `testRoute(module, request)` to call a route handler with a mock request and receive a response.
- ⬜ `testAction(action, formData)` to test server actions without starting a server.
- ⬜ `testLoad(module, params)` to run `load()` in isolation with mock params.
- ⬜ `testLayout(module, children)` to render a layout with mock children.
- ⬜ Official guide for integrating with Vitest.

```js
import { testRoute } from "@aster/testing";
import * as route from "./app/routes/blog/[slug].page.js";

const res = await testRoute(route, new Request("http://localhost/blog/hello"));
expect(res.status).toBe(200);
```

## v0.7 - Plugin And Adapter API

> **Priority: Medium.** This is required for the ecosystem to grow beyond solo use.

- ⬜ Plugin hooks for build, request, and response lifecycle.
- ⬜ Stable public API for third-party plugins to hook into the compiler.
- ⬜ First-party reference plugins:
  - `@aster/mdx` - MDX file support for content-heavy sites.
  - `@aster/auth` - opinionated auth layer built on the v0.4 session utilities.
  - `@aster/db` - lightweight DB query helpers with connection pooling.

## v1.0 - Docs Site And Stability

> **Priority: Required for public launch.**

- ⬜ Dedicated docs site, ideally built with Aster itself.
- ⬜ Full API reference for `@aster/core`, `@aster/compiler`, `@aster/cli`, and `@aster/dev`.
- ⬜ Guides: getting started, routing, islands, server actions, streaming, and deployment.
- ⬜ Migration guide from `v0.x` to `v1.0`.
- ⬜ Public changelog and semver commitment.
- ⬜ Stability guarantees: no breaking changes to documented APIs without a major version.

## Suggested Priority Order

If we can only focus on one thing at a time:

```text
1. Route/module TypeScript types  -> unblocks anyone trying to use Aster seriously
2. Islands DX                     -> removes the biggest rough edge
3. Vercel adapter                 -> gets Aster deployed in the real world
4. Auth and middleware            -> makes real apps easier to build
5. Testing utilities              -> enables confident contributions
6. Plugin API                     -> opens the door to an ecosystem
7. Docs site                      -> signals v1.0 readiness
```

## Recently Completed

- Production build diagnostics now fail on unsafe server/client boundary problems and intent/action mismatches.
- Browser JavaScript assets are lightly minified in production builds.
- `.ts` and `.tsx` routes/server modules compile to JavaScript.
- `.ts` browser island modules compile to hashed JavaScript assets.
- Route authoring types now cover route handlers, loaders, metadata, layouts, and boundaries.
- A strict `npm run typecheck` harness now validates route-module type fixtures.

*Last updated: May 2026*
