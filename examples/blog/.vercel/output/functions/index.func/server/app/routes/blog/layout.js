import { html } from "../../../packages/aster-core/src/index.js";

export default function BlogLayout({ children }) {
  return html`<section class="blog-layout">
    <aside class="blog-rail">
      <p>Blog</p>
      <a href="/">All posts</a>
    </aside>
    ${children}
  </section>`;
}
