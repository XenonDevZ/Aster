const HTML_BRAND = Symbol.for("aster.html");
const HTML_STREAM_BRAND = Symbol.for("aster.htmlStream");

export class HtmlString {
  constructor(value) {
    this[HTML_BRAND] = true;
    this.value = String(value);
  }

  toString() {
    return this.value;
  }
}

export class HtmlStream {
  constructor(values) {
    this[HTML_STREAM_BRAND] = true;
    this.values = values;
  }

  async *[Symbol.asyncIterator]() {
    yield* normalizeStreamValue(this.values);
  }

  toString() {
    throw new TypeError("HTML streams cannot be rendered synchronously. Return them from page() instead.");
  }
}

export function isHtml(value) {
  return Boolean(value && value[HTML_BRAND]);
}

export function isHtmlStream(value) {
  return Boolean(value && value[HTML_STREAM_BRAND]);
}

export function raw(value) {
  return new HtmlString(value ?? "");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === false) {
    return "";
  }

  if (isHtml(value)) {
    return value.toString();
  }

  if (isHtmlStream(value)) {
    throw new TypeError("Cannot render an HTML stream inside a synchronous HTML value.");
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue).join("");
  }

  return escapeHtml(value);
}

function containsHtmlStream(value) {
  if (isHtmlStream(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsHtmlStream);
  }

  return false;
}

function isIterable(value) {
  return Boolean(value && typeof value !== "string" && typeof value[Symbol.iterator] === "function");
}

function isAsyncIterable(value) {
  return Boolean(value && typeof value[Symbol.asyncIterator] === "function");
}

async function* normalizeStreamValue(value) {
  const resolved = await value;

  if (resolved === null || resolved === undefined || resolved === false) {
    return;
  }

  if (isHtml(resolved)) {
    yield resolved.toString();
    return;
  }

  if (isHtmlStream(resolved)) {
    for await (const chunk of resolved) {
      yield chunk;
    }
    return;
  }

  if (Array.isArray(resolved) || isIterable(resolved) || isAsyncIterable(resolved)) {
    for await (const chunk of resolved) {
      yield* normalizeStreamValue(chunk);
    }
    return;
  }

  yield escapeHtml(resolved);
}

export function stream(values) {
  return new HtmlStream(values);
}

export function toReadableStream(value) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of normalizeStreamValue(value)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

export function html(strings, ...values) {
  if (values.some(containsHtmlStream)) {
    const parts = [];

    for (let index = 0; index < strings.length; index += 1) {
      parts.push(raw(strings[index]));

      if (index < values.length) {
        parts.push(values[index]);
      }
    }

    return stream(parts);
  }

  let output = "";

  for (let index = 0; index < strings.length; index += 1) {
    output += strings[index];

    if (index < values.length) {
      output += normalizeValue(values[index]);
    }
  }

  return raw(output);
}

export function join(values, separator = "") {
  if (values.some(containsHtmlStream)) {
    const parts = [];

    values.forEach((value, index) => {
      if (index > 0) {
        parts.push(raw(separator));
      }
      parts.push(value);
    });

    return stream(parts);
  }

  const normalized = [];

  for (const value of values) {
    const next = normalizeValue(value);

    if (next) {
      normalized.push(next);
    }
  }

  return raw(normalized.join(separator));
}

export function attrs(attributes) {
  const pairs = [];

  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === false || value === null || value === undefined) {
      continue;
    }

    if (value === true) {
      pairs.push(escapeAttribute(name));
      continue;
    }

    pairs.push(`${escapeAttribute(name)}="${escapeAttribute(value)}"`);
  }

  return raw(pairs.length > 0 ? ` ${pairs.join(" ")}` : "");
}
