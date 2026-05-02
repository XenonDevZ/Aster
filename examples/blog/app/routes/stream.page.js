import { html, page, stream } from "../../../../packages/aster-core/src/index.js";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function* renderUpdates() {
  yield html`<section class="stream-card">
    <span>0 ms</span>
    <h2>Document shell flushed</h2>
    <p>The browser can receive the page structure before every slow server task finishes.</p>
  </section>`;

  await wait(120);
  yield html`<section class="stream-card">
    <span>120 ms</span>
    <h2>Data chunk resolved</h2>
    <p>This chunk stands in for a database query, model call, or slow API response.</p>
  </section>`;

  await wait(120);
  yield html`<section class="stream-card">
    <span>240 ms</span>
    <h2>Interactive runtime appended</h2>
    <p>Aster keeps the island runtime at the end of the streamed document.</p>
  </section>`;
}

export function GET() {
  return page(
    stream([
      html`<main class="stream-page">
        <section class="contact-copy">
          <p class="eyebrow">Streaming SSR</p>
          <h1>Send the shell first, then stream the rest.</h1>
          <p class="lede">
            This page returns an HTML stream. The root layout wraps it normally because Aster's html template is
            streaming-aware.
          </p>
        </section>
        <section class="stream-list">`,
      stream(renderUpdates()),
      html`</section>
      </main>`
    ]),
    {
      title: "Aster Streaming SSR",
      head: html`<link rel="stylesheet" href="/styles.css" />`
    }
  );
}
