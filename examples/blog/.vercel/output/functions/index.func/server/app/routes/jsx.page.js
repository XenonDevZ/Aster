import { jsx as __asterJsx, Fragment as __asterFragment } from "../../packages/aster-core/src/index.js";
import { page } from "../../packages/aster-core/src/index.js";

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
    __asterJsx("article",{"className":"post","children":__asterJsx("a",{"href":"/jsx","children":[__asterJsx("span",{"children":"JSX"}),__asterJsx("h2",{"children":(title)}),__asterJsx("p",{"children":(children)})]})})
  );
}

export function GET() {
  return page(
    __asterJsx("main",{"className":"jsx-page","children":[__asterJsx("section",{"className":"contact-copy","children":[__asterJsx("p",{"className":"eyebrow","children":"JSX Runtime"}),__asterJsx("h1",{"children":"Write page UI with components."}),__asterJsx("p",{"className":"lede","children":"Aster now compiles .jsx routes into runtime calls, then renders them through the same layout, SSR, and streaming pipeline."})]}),__asterJsx("section",{"className":"posts","aria-label":"JSX features","children":(features.map((feature) => (
          __asterJsx(FeatureCard,{"title":(feature.title),"children":(feature.body)})
        )))})]}),
    {
      title: "Aster JSX",
      head: __asterJsx("link",{"rel":"stylesheet","href":"/styles.css"})
    }
  );
}
