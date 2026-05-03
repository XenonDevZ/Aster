import { html, island, join, page } from "../../packages/aster-core/src/index.js";

import Counter from "../components/counter.js";

const posts = [
  {
    slug: "compiler-driven-web",
    title: "Compiler-driven web apps",
    excerpt: "Why Aster keeps most pages on the server and ships tiny interactive islands."
  },
  {
    slug: "server-actions",
    title: "Server actions without ceremony",
    excerpt: "A design sketch for forms that call server code without building a separate API layer."
  },
  {
    slug: "adapter-future",
    title: "Adapters as a framework boundary",
    excerpt: "The framework core uses Request and Response so Node, edge, and worker runtimes can share one contract."
  },
  {
    slug: "broken",
    title: "Broken route boundary",
    excerpt: "This link intentionally throws from load() so the blog error boundary can render."
  }
];

export function GET() {
  return page(
    html`<main>
      <section class="hero">
        <p class="eyebrow">Aster Framework</p>
        <h1>HTML-first apps with interactive islands.</h1>
        <p class="lede">
          Aster renders complete pages on the server, then hydrates only the components that need browser state.
        </p>
        ${island(
          Counter,
          { start: 3, label: "People trying the prototype" },
          html`<button class="counter" type="button">People trying the prototype: 3</button>`
        )}
      </section>

      <section class="posts" aria-label="Example posts">
        ${join(
          posts.map(
            (post) => html`<article class="post">
              <a href="/blog/${post.slug}">
                <span>Read</span>
                <h2>${post.title}</h2>
                <p>${post.excerpt}</p>
              </a>
            </article>`
          )
        )}
      </section>
    </main>`,
    {
      title: "Aster Framework",
      head: html`<link rel="stylesheet" href="/styles.css" />`
    }
  );
}
