import { isHtml, isHtmlStream, toReadableStream } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";
import { isPage, page, preparePage, renderDocument } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/page.js.mjs";

function withDefaultHeader(headers, name, value) {
  const next = new Headers(headers);

  if (!next.has(name)) {
    next.set(name, value);
  }

  return next;
}

export function htmlResponse(body, init = {}) {
  if (isHtmlStream(body)) {
    return new Response(toReadableStream(body), {
      ...init,
      headers: withDefaultHeader(init.headers, "content-type", "text/html; charset=utf-8")
    });
  }

  return new Response(body.toString(), {
    ...init,
    headers: withDefaultHeader(init.headers, "content-type", "text/html; charset=utf-8")
  });
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: withDefaultHeader(init.headers, "content-type", "application/json; charset=utf-8")
  });
}

export function text(body, init = {}) {
  return new Response(String(body), {
    ...init,
    headers: withDefaultHeader(init.headers, "content-type", "text/plain; charset=utf-8")
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function redirectStatus(status) {
  const value = Number(status);
  return REDIRECT_STATUSES.has(value) ? value : 302;
}

function safeRedirectLocation(location, options = {}) {
  const fallback = options.fallback ?? "/";
  const raw = String(location ?? "");

  if (/[\r\n]/.test(raw)) {
    return fallback;
  }

  const value = raw.trim();

  if (!value || value.startsWith("//") || value.startsWith("\\\\")) {
    return fallback;
  }

  let parsed;
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);

  try {
    parsed = new URL(value, "http://aster.local");
  } catch {
    return fallback;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return fallback;
  }

  if ((hasProtocol || parsed.origin !== "http://aster.local") && !options.allowExternal) {
    return fallback;
  }

  return value;
}

export function safeRedirect(location, status = 302, options = {}) {
  if (typeof status === "object" && status !== null) {
    options = status;
    status = 302;
  }

  return new Response(null, {
    status: redirectStatus(status),
    headers: {
      location: safeRedirectLocation(location, options)
    }
  });
}

export function redirect(location, status = 302, options = {}) {
  return safeRedirect(location, status, options);
}

export async function toResponse(value, appContext = {}) {
  if (value instanceof Response) {
    return value;
  }

  if (isPage(value)) {
    const pageResult = await preparePage(value, appContext);
    const document = appContext.document ?? renderDocument;
    const markup = document(pageResult, appContext);

    return htmlResponse(markup, {
      status: pageResult.status,
      headers: pageResult.headers
    });
  }

  if (isHtml(value) || isHtmlStream(value)) {
    return toResponse(page(value), appContext);
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return text(value);
  }

  if (value === null || value === undefined) {
    return new Response(null, { status: 204 });
  }

  return json(value);
}
