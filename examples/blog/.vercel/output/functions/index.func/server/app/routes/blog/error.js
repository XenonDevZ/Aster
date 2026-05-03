import { jsx as __asterJsx, Fragment as __asterFragment } from "../../../packages/aster-core/src/index.js";
import { page } from "../../../packages/aster-core/src/index.js";

export function meta() {
  return {
    title: "Blog route error | Aster",
    description: "A route-specific error boundary rendered this page."
  };
}

export default function BlogError({ error }) {
  return page(
    __asterJsx("main",{"className":"error-page","children":__asterJsx("section",{"children":[__asterJsx("p",{"className":"eyebrow","children":"Error Boundary"}),__asterJsx("h1",{"children":"The blog route recovered."}),__asterJsx("p",{"className":"lede","children":(error.message)}),__asterJsx("a",{"className":"counter","href":"/","children":"Back to posts"})]})}),
    {
      title: "Blog route error",
      head: __asterJsx("link",{"rel":"stylesheet","href":"/styles.css"}),
      status: 500
    }
  );
}
