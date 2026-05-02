import { existsSync, watch } from "node:fs";
import path from "node:path";

const RELOAD_PATH = "/_aster/dev/events";

export function createLiveReloadHub() {
  const encoder = new TextEncoder();
  const clients = new Set();

  function send(controller, event, data = {}) {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  }

  return {
    path: RELOAD_PATH,
    clients,

    response() {
      let clientController;

      return new Response(
        new ReadableStream({
          start(controller) {
            clientController = controller;
            clients.add(controller);
            send(controller, "ready", { ok: true });
          },
          cancel() {
            clients.delete(clientController);
          }
        }),
        {
          headers: {
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            "content-type": "text/event-stream; charset=utf-8",
            "x-accel-buffering": "no"
          }
        }
      );
    },

    broadcast(event = "reload", data = {}) {
      for (const controller of [...clients]) {
        try {
          send(controller, event, data);
        } catch {
          clients.delete(controller);
        }
      }
    }
  };
}

export const liveReloadRuntime = `<script type="module" data-aster-dev-reload>
const ASTER_DEV_RELOAD = "__asterDevReload";

if (!window[ASTER_DEV_RELOAD]) {
  window[ASTER_DEV_RELOAD] = true;
  const events = new EventSource("/_aster/dev/events");

  events.addEventListener("reload", () => {
    window.location.reload();
  });

  events.addEventListener("error", () => {
    document.documentElement.setAttribute("data-aster-dev-disconnected", "");
  });

  events.addEventListener("ready", () => {
    document.documentElement.removeAttribute("data-aster-dev-disconnected");
  });
}
</script>`;

export async function injectLiveReload(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  const markup = await response.text();
  const html = markup.includes("</body>")
    ? markup.replace("</body>", `${liveReloadRuntime}\n</body>`)
    : `${markup}\n${liveReloadRuntime}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function watchProject(root, hub, options = {}) {
  const debounceMs = options.debounceMs ?? 40;
  const directories = ["app", "public"].map((directory) => path.join(root, directory));
  const watchers = [];
  let timer = null;

  function schedule(fileName) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      hub.broadcast("reload", {
        file: fileName ? String(fileName) : null
      });
    }, debounceMs);
  }

  for (const directory of directories) {
    if (!existsSync(directory)) {
      continue;
    }

    watchers.push(
      watch(directory, { recursive: true }, (_event, fileName) => {
        schedule(fileName);
      })
    );
  }

  return {
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.close();
      }
    }
  };
}
