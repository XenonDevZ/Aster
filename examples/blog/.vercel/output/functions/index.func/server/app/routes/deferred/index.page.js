import { defer, html, page, renderDeferred } from "../../../packages/aster-core/src/index.js";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getComments() {
  await wait(180);

  return [
    "The shell rendered before this list was ready.",
    "The loading boundary filled the gap.",
    "The resolved HTML replaced the placeholder."
  ];
}

export function load() {
  return {
    summary: "This route combines loaders, loading boundaries, deferred data, and streaming SSR.",
    comments: defer(getComments(), { name: "comments" })
  };
}

export function meta() {
  return {
    title: "Aster Deferred Data",
    description: "Aster can stream loading UI while slow loader data resolves."
  };
}

export function GET({ data }) {
  return page(
    html`<main class="stream-page">
      <section class="contact-copy">
        <p class="eyebrow">Deferred Data</p>
        <h1>Stream loading UI, then replace it.</h1>
        <p class="lede">${data.summary}</p>
      </section>

      <section class="stream-list">
        ${renderDeferred(
          data.comments,
          (comments) => html`<section class="stream-card resolved-card">
            <span>Resolved</span>
            <h2>Comment stream resolved</h2>
            <ul>
              ${comments.map((comment) => html`<li>${comment}</li>`)}
            </ul>
          </section>`
        )}
      </section>
    </main>`,
    {
      title: "Aster Deferred Data",
      head: html`<link rel="stylesheet" href="/styles.css" />`
    }
  );
}
