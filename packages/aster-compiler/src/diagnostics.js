const FATAL_CODES = new Set([
  "client-imports-server-module",
  "undeclared-route-action",
  "unknown-intent-action"
]);

function formatDiagnostic(diagnostic) {
  const location = diagnostic.importer ?? diagnostic.route ?? "build";
  const target = diagnostic.imported ?? diagnostic.action;
  const suffix = target ? ` -> ${target}` : "";

  return `[${diagnostic.code}] ${location}${suffix}: ${diagnostic.message}`;
}

export class BuildDiagnosticsError extends Error {
  constructor(diagnostics) {
    super(`Aster build failed with ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}:\n${diagnostics.map(formatDiagnostic).join("\n")}`);
    this.name = "BuildDiagnosticsError";
    this.diagnostics = diagnostics;
  }
}

export function fatalDiagnostics(...sources) {
  return sources
    .flatMap((source) => source ?? [])
    .filter((diagnostic) => diagnostic.level === "error" || FATAL_CODES.has(diagnostic.code));
}

export function assertNoFatalDiagnostics(...sources) {
  const diagnostics = fatalDiagnostics(...sources);

  if (diagnostics.length > 0) {
    throw new BuildDiagnosticsError(diagnostics);
  }
}
