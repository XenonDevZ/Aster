import { jsx as __asterJsx, Fragment as __asterFragment } from "../../packages/aster-core/src/index.js";
import { page } from "../../packages/aster-core/src/index.js";
const features = [
  ["Typed routes", ".page.ts and .page.tsx files are compiled before Aster imports them."],
  ["Typed modules", "Server modules and island modules can use common TypeScript annotations."],
  ["Built output", "Production builds emit runnable JavaScript files for TypeScript sources."]
];

function FeatureCard({ title, children }) {
  return (
    __asterJsx("article",{"className":"post","children":__asterJsx("a",{"href":"/typescript","children":[__asterJsx("span",{"children":"TypeScript"}),__asterJsx("h2",{"children":(title)}),__asterJsx("p",{"children":(children)})]})})
  );
}

export const GET = () => {
  return page(
    __asterJsx("main",{"className":"jsx-page","children":[__asterJsx("section",{"className":"contact-copy","children":[__asterJsx("p",{"className":"eyebrow","children":"TypeScript Compiler"}),__asterJsx("h1",{"children":"Write typed route modules."}),__asterJsx("p",{"className":"lede","children":"Aster lowers common TypeScript and TSX syntax into JavaScript for dev imports, browser assets, and production server output."})]}),__asterJsx("section",{"className":"posts","aria-label":"TypeScript features","children":(features.map((feature) => (
          __asterJsx(FeatureCard,{"title":(feature[0]),"children":(feature[1])})
        )))})]}),
    {
      title: "Aster TypeScript",
      head: __asterJsx("link",{"rel":"stylesheet","href":"/styles.css"})
    }
  );
};
