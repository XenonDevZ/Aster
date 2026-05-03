import { page } from "../../../../packages/aster-core/src/index.js";
import type { RouteHandler } from "../../../../packages/aster-core/src/index.js";

type Feature = readonly [string, string];

const features: Feature[] = [
  ["Typed routes", ".page.ts and .page.tsx files are compiled before Aster imports them."],
  ["Typed modules", "Server modules and island modules can use common TypeScript annotations."],
  ["Built output", "Production builds emit runnable JavaScript files for TypeScript sources."]
];

function FeatureCard({ title, children }) {
  return (
    <article className="post">
      <a href="/typescript">
        <span>TypeScript</span>
        <h2>{title}</h2>
        <p>{children}</p>
      </a>
    </article>
  );
}

export const GET: RouteHandler = () => {
  return page(
    <main className="jsx-page">
      <section className="contact-copy">
        <p className="eyebrow">TypeScript Compiler</p>
        <h1>Write typed route modules.</h1>
        <p className="lede">
          Aster lowers common TypeScript and TSX syntax into JavaScript for dev imports, browser assets, and production
          server output.
        </p>
      </section>

      <section className="posts" aria-label="TypeScript features">
        {features.map((feature) => (
          <FeatureCard title={feature[0]}>{feature[1]}</FeatureCard>
        ))}
      </section>
    </main>,
    {
      title: "Aster TypeScript",
      head: <link rel="stylesheet" href="/styles.css" />
    }
  );
};
