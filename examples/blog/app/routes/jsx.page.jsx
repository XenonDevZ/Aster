import { page } from "../../../../packages/aster-core/src/index.js";

const features = [
  {
    title: "Function components",
    body: "Components are plain functions that return Aster HTML values."
  },
  {
    title: "Server-safe attributes",
    body: "className, htmlFor, boolean attributes, and style objects render to HTML."
  },
  {
    title: "Compiler route support",
    body: ".page.jsx files are compiled during route manifest creation."
  }
];

function FeatureCard({ title, children }) {
  return (
    <article className="post">
      <a href="/jsx">
        <span>JSX</span>
        <h2>{title}</h2>
        <p>{children}</p>
      </a>
    </article>
  );
}

export function GET() {
  return page(
    <main className="jsx-page">
      <section className="contact-copy">
        <p className="eyebrow">JSX Runtime</p>
        <h1>Write page UI with components.</h1>
        <p className="lede">
          Aster now compiles .jsx routes into runtime calls, then renders them through the same layout, SSR, and streaming
          pipeline.
        </p>
      </section>

      <section className="posts" aria-label="JSX features">
        {features.map((feature) => (
          <FeatureCard title={feature.title}>{feature.body}</FeatureCard>
        ))}
      </section>
    </main>,
    {
      title: "Aster JSX",
      head: <link rel="stylesheet" href="/styles.css" />
    }
  );
}
