import { html, raw, stream } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";

const DEFERRED_BRAND = Symbol.for("aster.deferred");
let deferredId = 0;

export class DeferredData {
  constructor(value, options = {}) {
    this[DEFERRED_BRAND] = true;
    this.promise = Promise.resolve(value);
    this.fallback = options.fallback;
    this.name = options.name;
  }
}

export function defer(value, options = {}) {
  return new DeferredData(value, options);
}

export function isDeferred(value) {
  return Boolean(value && value[DEFERRED_BRAND]);
}

export function setDeferredFallback(value, fallback) {
  if (isDeferred(value) && value.fallback === undefined) {
    value.fallback = fallback;
  }

  return value;
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function nextDeferredId(name) {
  const suffix = name ? String(name).replace(/[^A-Za-z0-9_-]/g, "-") : "data";
  deferredId += 1;
  return `aster-deferred-${suffix}-${deferredId}`;
}

function replacementScript(id) {
  const serialized = JSON.stringify(id);

  return raw(`<script type="module">
{
  const id = ${serialized};
  const template = document.querySelector(\`template[data-aster-deferred="\${id}"]\`);
  const target = document.getElementById(id);
  if (template && target) {
    target.replaceWith(template.content.cloneNode(true));
    template.remove();
  }
}
</script>`);
}

export function renderDeferred(value, render, fallback) {
  if (!isDeferred(value) && !isPromiseLike(value)) {
    return render(value);
  }

  const deferred = isDeferred(value) ? value : defer(value);
  const id = nextDeferredId(deferred.name);

  return stream(
    (async function* renderDeferredValue() {
      yield raw(`<aster-deferred id="${id}" data-pending="">`);
      yield fallback ?? deferred.fallback ?? html`<span>Loading...</span>`;
      yield raw(`</aster-deferred>`);

      try {
        const resolved = await deferred.promise;
        yield raw(`<template data-aster-deferred="${id}">`);
        yield await render(resolved);
        yield raw(`</template>`);
        yield replacementScript(id);
      } catch (error) {
        yield raw(`<template data-aster-deferred="${id}">`);
        yield html`<section role="alert">Deferred data failed: ${error.message}</section>`;
        yield raw(`</template>`);
        yield replacementScript(id);
      }
    })()
  );
}
