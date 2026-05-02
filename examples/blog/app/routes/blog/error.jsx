import { page } from "../../../../../packages/aster-core/src/index.js";

export function meta() {
  return {
    title: "Blog route error | Aster",
    description: "A route-specific error boundary rendered this page."
  };
}

export default function BlogError({ error }) {
  return page(
    <main className="error-page">
      <section>
        <p className="eyebrow">Error Boundary</p>
        <h1>The blog route recovered.</h1>
        <p className="lede">{error.message}</p>
        <a className="counter" href="/">Back to posts</a>
      </section>
    </main>,
    {
      title: "Blog route error",
      head: <link rel="stylesheet" href="/styles.css" />,
      status: 500
    }
  );
}
