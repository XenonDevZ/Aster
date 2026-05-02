import { html } from "../../../packages/aster-core/src/index.js";

export function meta() {
  return {
    description: "Aster is an HTML-first, server-first web framework prototype.",
    meta: [
      { property: "og:site_name", content: "Aster Framework" },
      { name: "theme-color", content: "#1f5f69" }
    ]
  };
}

export default function RootLayout({ children }) {
  return html`<div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/">Aster</a>
      <nav aria-label="Primary">
        <a href="/">Posts</a>
        <a href="/jsx">JSX</a>
        <a href="/stream">Streaming</a>
        <a href="/deferred">Deferred</a>
        <a href="/contact">Contact</a>
      </nav>
    </header>
    ${children}
  </div>`;
}
