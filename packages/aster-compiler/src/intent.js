import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function cloneIntent(intent) {
  if (!intent) {
    return {};
  }

  return JSON.parse(JSON.stringify(intent));
}

function allowedActionNames(intent) {
  if (!Array.isArray(intent.actions)) {
    return null;
  }

  return new Set(intent.actions.map(String));
}

function actionDeclared(action, allowed) {
  return !allowed || allowed.has(action.name) || allowed.has(action.id);
}

function actionDiagnostics(route, intent) {
  const allowed = allowedActionNames(intent);

  if (!allowed) {
    return [];
  }

  const diagnostics = [];
  const actions = route.actions ?? [];

  for (const action of actions) {
    if (!actionDeclared(action, allowed)) {
      diagnostics.push({
        level: "warning",
        code: "undeclared-route-action",
        route: route.id,
        action: action.name,
        message: `Route ${route.id} exports action ${action.name}, but its intent.actions list does not include it.`
      });
    }
  }

  for (const name of allowed) {
    if (!actions.some((action) => action.name === name || action.id === name)) {
      diagnostics.push({
        level: "warning",
        code: "unknown-intent-action",
        route: route.id,
        action: name,
        message: `Route ${route.id} declares unknown intent action ${name}.`
      });
    }
  }

  return diagnostics;
}

function routeIntentEntry(route) {
  const intent = cloneIntent(route.intent ?? route.module?.intent);
  const diagnostics = actionDiagnostics(route, intent);

  return {
    id: route.id,
    pattern: route.pattern,
    methods: route.methods?.length > 0 ? route.methods : ["GET"],
    intent,
    actions: (route.actions ?? []).map((action) => ({
      id: action.id,
      name: action.name,
      path: action.path,
      declared: diagnostics.every(
        (diagnostic) => diagnostic.code !== "undeclared-route-action" || diagnostic.action !== action.name
      )
    })),
    diagnostics
  };
}

export function createIntentGraph(manifest, options = {}) {
  const routes = manifest.routes.map(routeIntentEntry);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: manifest.root,
    outputDirectory: options.outputDirectory ?? ".aster/output",
    routes,
    diagnostics: routes.flatMap((route) => route.diagnostics)
  };
}

export async function writeIntentGraph(intentGraph, options = {}) {
  const root = path.resolve(options.root ?? intentGraph.root ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? intentGraph.outputDirectory ?? ".aster/output";
  const absoluteOutputDirectory = path.resolve(root, outputDirectory);

  await mkdir(path.join(root, ".aster"), { recursive: true });
  await mkdir(absoluteOutputDirectory, { recursive: true });
  await writeFile(path.join(root, ".aster/intent.json"), `${JSON.stringify(intentGraph, null, 2)}\n`);
  await writeFile(path.join(absoluteOutputDirectory, "intent-graph.json"), `${JSON.stringify(intentGraph, null, 2)}\n`);

  return intentGraph;
}
