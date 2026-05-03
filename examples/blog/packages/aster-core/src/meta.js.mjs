import { attrs, html, isHtml, join, raw } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";

function normalizeList(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function renderTag(tagName, attributes) {
  return raw(`<${tagName}${attrs(attributes)}>`);
}

function renderMetaResult(result) {
  if (!result) {
    return {
      title: undefined,
      head: raw("")
    };
  }

  if (isHtml(result)) {
    return {
      title: undefined,
      head: result
    };
  }

  if (typeof result === "string") {
    return {
      title: result,
      head: raw("")
    };
  }

  const tags = [];

  if (result.description) {
    tags.push(renderTag("meta", { name: "description", content: result.description }));
  }

  for (const meta of normalizeList(result.meta)) {
    tags.push(renderTag("meta", meta));
  }

  for (const link of normalizeList(result.links ?? result.link)) {
    tags.push(renderTag("link", link));
  }

  if (result.head) {
    tags.push(isHtml(result.head) ? result.head : html`${result.head}`);
  }

  return {
    title: result.title,
    head: join(tags, "\n")
  };
}

function metadataSources(context = {}) {
  const layouts = context.route?.layouts ?? context.layouts ?? [];
  const route = context.route;

  return [
    ...layouts.map((layout) => ({
      id: layout.id,
      module: layout.module ?? layout
    })),
    route
      ? {
          id: route.id,
          module: route.module ?? route
        }
      : null
  ].filter(Boolean);
}

export async function applyMetadata(result, context = {}) {
  const sources = metadataSources(context);
  let title = result.title;
  const head = [result.head];

  for (const source of sources) {
    const meta = source.module?.meta;

    if (typeof meta !== "function") {
      continue;
    }

    const next = await meta({
      context,
      data: context.data,
      page: result,
      params: context.params ?? {},
      locals: context.locals ?? {},
      request: context.request,
      url: context.url
    });
    const rendered = renderMetaResult(next);

    if (rendered.title) {
      title = rendered.title;
    }

    if (rendered.head?.toString()) {
      head.push(rendered.head);
    }
  }

  return {
    ...result,
    title,
    head: join(head, "\n")
  };
}
