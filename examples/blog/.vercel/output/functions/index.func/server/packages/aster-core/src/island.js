import { escapeAttribute, html, isHtml, raw } from "./html.js";

export function island(component, props = {}, fallback = "") {
  const options =
    typeof component === "string"
      ? { src: component, exportName: "default" }
      : {
          src: component.src ?? component.__asterSource,
          exportName: component.exportName ?? component.export ?? component.__asterExport ?? "default"
        };

  if (!options.src) {
    throw new TypeError("island() requires a component module path.");
  }

  const serializedProps = encodeURIComponent(JSON.stringify(props ?? {}));
  const fallbackHtml = isHtml(fallback) ? fallback : html`${fallback}`;

  return raw(
    `<aster-island data-component="${escapeAttribute(options.src)}" data-export="${escapeAttribute(
      options.exportName
    )}" data-props="${escapeAttribute(serializedProps)}">${fallbackHtml}</aster-island>`
  );
}

export const islandRuntime = raw(`<script type="module">
const ASTER_ISLAND = "aster-island";

if (!customElements.get(ASTER_ISLAND)) {
  customElements.define(ASTER_ISLAND, class AsterIsland extends HTMLElement {
    async connectedCallback() {
      if (this.__asterHydrated) return;
      this.__asterHydrated = true;

      const componentPath = this.dataset.component;
      const exportName = this.dataset.export || "default";
      const encodedProps = this.dataset.props || "%7B%7D";

      try {
        const props = JSON.parse(decodeURIComponent(encodedProps));
        const module = await import(componentPath);
        const component = module[exportName] || module.default;
        const hydrate = typeof component === "function" ? component : component?.hydrate;

        if (typeof hydrate !== "function") {
          throw new TypeError(\`Island "\${componentPath}" does not export a hydrate function.\`);
        }

        await hydrate(this, props);
        this.setAttribute("data-ready", "");
      } catch (error) {
        this.setAttribute("data-error", "");
        console.error("[aster] failed to hydrate island", error);
      }
    }
  });
}
</script>`);
