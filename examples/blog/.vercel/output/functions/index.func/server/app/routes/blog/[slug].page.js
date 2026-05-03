import { html, page } from "../../../packages/aster-core/src/index.js";

const posts = {
  "compiler-driven-web": {
    title: "Compiler-driven web apps",
    body: [
      "Aster treats the server as the default runtime and the browser as an enhancement layer.",
      "The next compiler pass will split server-only modules from island modules so pages can stay lean by default.",
      "That boundary is what lets the framework offer nested routing, streaming HTML, and minimal client JavaScript."
    ]
  },
  "server-actions": {
    title: "Server actions without ceremony",
    body: [
      "Server actions should feel like regular functions attached to forms, not a separate API project.",
      "The framework can serialize action references at build time and post back to a generated endpoint.",
      "That design keeps mutations close to the route that owns the user experience."
    ]
  },
  "adapter-future": {
    title: "Adapters as a framework boundary",
    body: [
      "The runtime is centered on Fetch-style Request and Response objects.",
      "Adapters can translate between platform details and the framework contract.",
      "Node is the first adapter, but workers and edge runtimes can follow the same shape."
    ]
  }
};

export async function load({ params }) {
  if (params.slug === "broken") {
    throw new Error("The blog loader failed on purpose.");
  }

  return {
    post: posts[params.slug] ?? null
  };
}

export function meta({ data }) {
  if (!data.post) {
    return {
      title: "Post not found",
      description: "The requested Aster article could not be found."
    };
  }

  return {
    title: `${data.post.title} | Aster`,
    description: data.post.body[0],
    meta: [{ property: "og:title", content: data.post.title }]
  };
}

export function GET({ data }) {
  const post = data.post;

  if (!post) {
    return page(html`<main><h1>Post not found</h1><a href="/">Back home</a></main>`, {
      title: "Post not found",
      status: 404,
      head: html`<link rel="stylesheet" href="/styles.css" />`
    });
  }

  return page(
    html`<main class="article-shell">
      <a class="back-link" href="/">Back</a>
      <article class="article">
        <h1>${post.title}</h1>
        ${post.body.map((paragraph) => html`<p>${paragraph}</p>`)}
      </article>
    </main>`,
    {
      title: post.title,
      head: html`<link rel="stylesheet" href="/styles.css" />`
    }
  );
}
