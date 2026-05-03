import { html, isHtml, isHtmlStream, raw } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";
import { islandRuntime } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/island.js.mjs";
import { applyMetadata } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/meta.js.mjs";
import { navigationRuntime } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/navigation.js.mjs";

const PAGE_BRAND = Symbol.for("aster.page");

export function page(body, options = {}) {
  return {
    [PAGE_BRAND]: true,
    body: isHtml(body) || isHtmlStream(body) ? body : html`${body}`,
    title: options.title ?? "Aster App",
    head: options.head ?? raw(""),
    status: options.status ?? 200,
    headers: options.headers ?? {}
  };
}

export function isPage(value) {
  return Boolean(value && value[PAGE_BRAND]);
}

function toHtml(value) {
  return isHtml(value) || isHtmlStream(value) ? value : html`${value ?? ""}`;
}

function mergeHeaders(base, next) {
  return {
    ...(base ?? {}),
    ...(next ?? {})
  };
}

export async function applyPageLayouts(result, context = {}) {
  const layouts = context.route?.layouts ?? context.layouts ?? [];
  let current = result;

  for (const layout of [...layouts].reverse()) {
    const module = layout.module ?? layout;
    const render = layout.render ?? module.default ?? module.layout;

    if (typeof render !== "function") {
      throw new TypeError(`Layout "${layout.id ?? "anonymous"}" does not export a default render function.`);
    }

    const next = await render({
      children: current.body,
      page: current,
      context,
      data: context.data,
      request: context.request,
      url: context.url,
      params: context.params ?? {},
      locals: context.locals ?? {}
    });

    if (next instanceof Response) {
      throw new TypeError("Layouts must return HTML or page(), not Response.");
    }

    if (isPage(next)) {
      current = {
        ...current,
        ...next,
        headers: mergeHeaders(current.headers, next.headers),
        body: next.body
      };
    } else {
      current = {
        ...current,
        body: toHtml(next)
      };
    }
  }

  return current;
}

export async function preparePage(result, context = {}) {
  return applyMetadata(await applyPageLayouts(result, context), context);
}

export function renderDocument(result) {
  const title = result.title ?? "Aster App";
  const head = isHtml(result.head) ? result.head : html`${result.head ?? ""}`;

  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        ${head}
      </head>
      <body>
        ${result.body}
        ${islandRuntime}
        ${navigationRuntime}
      </body>
    </html>`;
}
