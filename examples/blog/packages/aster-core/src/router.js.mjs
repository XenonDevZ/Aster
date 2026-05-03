const ROUTE_PARAM = /^:([A-Za-z_$][\w$]*)$/;
const ROUTE_SPLAT = /^\*([A-Za-z_$][\w$]*)?$/;

function normalizePattern(pattern) {
  if (!pattern || pattern === "/") {
    return "/";
  }

  return `/${pattern}`.replaceAll(/\/+/g, "/").replace(/\/$/, "");
}

function escapeRegex(segment) {
  return segment.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

export function compileRoute(pattern) {
  const normalized = normalizePattern(pattern);

  if (normalized === "/") {
    return {
      pattern: normalized,
      keys: [],
      regex: /^\/?$/,
      score: 1000
    };
  }

  const keys = [];
  const segments = normalized.slice(1).split("/");
  let score = 0;
  const source = segments
    .map((segment) => {
      const paramMatch = segment.match(ROUTE_PARAM);
      const splatMatch = segment.match(ROUTE_SPLAT);

      if (paramMatch) {
        keys.push(paramMatch[1]);
        score += 3;
        return "([^/]+)";
      }

      if (splatMatch) {
        keys.push(splatMatch[1] ?? "rest");
        score -= 10;
        return "(.*)";
      }

      score += 10;
      return escapeRegex(segment);
    })
    .join("/");

  return {
    pattern: normalized,
    keys,
    regex: new RegExp(`^/${source}/?$`),
    score
  };
}

export function createRouter(routes) {
  const entries = routes
    .map((route) => {
      const compiled = compileRoute(route.pattern);

      return {
        ...route,
        ...compiled,
        pattern: compiled.pattern
      };
    })
    .sort((left, right) => right.score - left.score || left.pattern.localeCompare(right.pattern));

  return {
    routes: entries,

    match(pathname) {
      for (const route of entries) {
        const match = route.regex.exec(pathname);

        if (!match) {
          continue;
        }

        const params = {};

        for (let index = 0; index < route.keys.length; index += 1) {
          params[route.keys[index]] = decodeURIComponent(match[index + 1] ?? "");
        }

        return {
          route,
          params
        };
      }

      return null;
    }
  };
}
