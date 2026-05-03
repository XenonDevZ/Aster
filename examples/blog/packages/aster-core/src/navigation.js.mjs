import { raw } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";

export const navigationRuntime = raw(`<script type="module">
const ASTER_NAVIGATION = "__asterNavigation";

if (!window[ASTER_NAVIGATION]) {
  window[ASTER_NAVIGATION] = true;

  const state = {
    inflight: null
  };

  function sameOrigin(url) {
    return url.origin === window.location.origin;
  }

  function shouldHandleClick(event, anchor) {
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return false;
    if (anchor.hasAttribute("data-aster-reload")) return false;
    if (anchor.closest("[data-aster-reload]")) return false;

    const url = new URL(anchor.href, window.location.href);

    if (!sameOrigin(url)) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return false;

    return true;
  }

  function copyHead(nextDocument) {
    const currentManaged = document.head.querySelectorAll("[data-aster-head]");
    for (const node of currentManaged) {
      node.remove();
    }

    const nextTitle = nextDocument.querySelector("title");
    if (nextTitle) {
      document.title = nextTitle.textContent || "";
    }

    const nextManaged = nextDocument.head.querySelectorAll("meta, link, style");
    for (const node of nextManaged) {
      if (node.matches("meta[charset], meta[name='viewport']")) {
        continue;
      }

      const clone = node.cloneNode(true);
      clone.setAttribute("data-aster-head", "");
      document.head.appendChild(clone);
    }
  }

  async function visit(url, options = {}) {
    const nextUrl = new URL(url, window.location.href);

    if (!sameOrigin(nextUrl)) {
      window.location.href = nextUrl.href;
      return;
    }

    state.inflight?.abort();
    const controller = new AbortController();
    state.inflight = controller;
    document.documentElement.setAttribute("data-aster-navigating", "");

    try {
      const response = await fetch(nextUrl.href, {
        headers: {
          accept: "text/html",
          "x-aster-navigation": "1"
        },
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || !contentType.includes("text/html")) {
        window.location.href = nextUrl.href;
        return;
      }

      const markup = await response.text();
      const nextDocument = new DOMParser().parseFromString(markup, "text/html");

      copyHead(nextDocument);
      document.body.replaceWith(nextDocument.body);

      if (options.history !== "replace") {
        window.history.pushState({ aster: true }, "", nextUrl.href);
      } else {
        window.history.replaceState({ aster: true }, "", nextUrl.href);
      }

      window.dispatchEvent(new CustomEvent("aster:navigate", {
        detail: {
          url: nextUrl.href
        }
      }));
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("[aster] navigation failed", error);
        window.location.href = nextUrl.href;
      }
    } finally {
      if (state.inflight === controller) {
        state.inflight = null;
      }
      document.documentElement.removeAttribute("data-aster-navigating");
    }
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target?.closest?.("a[href]");

    if (!shouldHandleClick(event, anchor)) {
      return;
    }

    event.preventDefault();
    visit(anchor.href);
  });

  window.addEventListener("popstate", () => {
    visit(window.location.href, {
      history: "replace"
    });
  });

  window.aster = Object.assign(window.aster || {}, {
    navigate: visit
  });
}
</script>`);
