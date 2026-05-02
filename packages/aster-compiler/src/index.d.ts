export type RouteManifestEntry = {
  id: string;
  filePath: string;
  pattern: string;
  methods: string[];
  intent?: RouteIntent;
  actions: ActionManifestEntry[];
  layouts: LayoutManifestEntry[];
  errorBoundaries: BoundaryManifestEntry[];
  loadingBoundaries: BoundaryManifestEntry[];
  module: Record<string, unknown>;
};

export type RouteIntent = {
  actions?: string[];
  islands?: string[];
  navigation?: "soft" | "reload" | false;
  cache?: string | false;
  security?: {
    csrf?: boolean;
    maxBody?: number | string | false;
  };
} & Record<string, unknown>;

export type ActionManifestEntry = {
  id: string;
  name: string;
  path: string;
  ref: unknown;
};

export type LayoutManifestEntry = {
  id: string;
  filePath: string;
  module: Record<string, unknown>;
};

export type BoundaryManifestEntry = {
  id: string;
  filePath: string;
  module: Record<string, unknown>;
};

export type RouteManifest = {
  root: string;
  appDirectory: string;
  routesDirectory: string;
  layouts: LayoutManifestEntry[];
  errorBoundaries: BoundaryManifestEntry[];
  loadingBoundaries: BoundaryManifestEntry[];
  routes: RouteManifestEntry[];
};

export type ProductionAssetEntry = {
  type: "public" | "app";
  source: string;
  file: string;
  url: string;
  size: number;
  hash: string;
  integrity: string;
};

export type ProductionAssetManifest = {
  version: number;
  generatedAt: string;
  outputDirectory: string;
  assetsBase: string;
  assets: Record<string, ProductionAssetEntry>;
  graph: {
    entries: string[];
    modules: string[];
    diagnostics: ModuleGraphDiagnostic[];
  };
};

export type ModuleGraphImport = {
  specifier: string;
  resolved?: string;
  external?: boolean;
};

export type ModuleGraphModule = {
  id: string;
  filePath: string;
  imports: ModuleGraphImport[];
};

export type ModuleGraphDiagnostic = {
  level: "warning" | "error";
  code: string;
  message: string;
  importer?: string;
  imported?: string;
  route?: string;
  action?: string;
};

export type ModuleGraph = {
  version: number;
  generatedAt: string;
  root: string;
  server: {
    entries: string[];
    modules: ModuleGraphModule[];
    externals: Array<{ specifier: string; importedBy: string }>;
    diagnostics: ModuleGraphDiagnostic[];
  };
  client: {
    entries: string[];
    modules: ModuleGraphModule[];
    externals: Array<{ specifier: string; importedBy: string }>;
    diagnostics: ModuleGraphDiagnostic[];
  };
};

export type ServerOutputManifest = {
  version: number;
  generatedAt: string;
  outputDirectory: string;
  serverRoot: string;
  appDirectory: string;
  files: Array<{ source: string; file: string }>;
  graph: {
    entries: string[];
    modules: string[];
    externals: Array<{ specifier: string; importedBy: string }>;
    diagnostics: ModuleGraphDiagnostic[];
  };
  runtime: {
    "@aster/core": string;
    files: string[];
  };
};

export type IntentGraphRoute = {
  id: string;
  pattern: string;
  methods: string[];
  intent: RouteIntent;
  actions: Array<{ id: string; name: string; path: string; declared: boolean }>;
  diagnostics: ModuleGraphDiagnostic[];
};

export type IntentGraph = {
  version: number;
  generatedAt: string;
  root: string;
  outputDirectory: string;
  routes: IntentGraphRoute[];
  diagnostics: ModuleGraphDiagnostic[];
};

export function routePatternFromFile(filePath: string, routesDirectory: string): string;
export function discoverRouteFiles(routesDirectory: string): Promise<string[]>;
export function discoverLayoutFiles(appDirectory: string, routesDirectory: string): Promise<string[]>;
export function discoverErrorFiles(appDirectory: string, routesDirectory: string): Promise<string[]>;
export function discoverLoadingFiles(appDirectory: string, routesDirectory: string): Promise<string[]>;
export function boundaryChainForRoute(
  filePath: string,
  appDirectory: string,
  routesDirectory: string,
  boundaryByDirectory: Map<string, BoundaryManifestEntry>
): BoundaryManifestEntry[];
export function transformJsx(source: string, options?: { injectImport?: boolean }): { code: string; transformed: boolean };
export function compileJsxModule(filePath: string, options?: { root?: string; outputRoot?: string }): Promise<{
  sourcePath: string;
  outputPath: string;
  outputUrl: string;
  transformed: boolean;
}>;
export function createRouteManifest(options: {
  root?: string;
  routesDirectory?: string;
  cacheBust?: boolean;
}): Promise<RouteManifest>;
export function parseModuleSpecifiers(source: string): string[];
export function resolveModuleSpecifier(specifier: string, importer: string): Promise<string | null>;
export function createModuleGraph(options?: {
  root?: string;
  serverEntries?: string[];
  clientEntries?: string[];
}): Promise<ModuleGraph>;
export function createIntentGraph(manifest: RouteManifest, options?: { outputDirectory?: string }): IntentGraph;
export function writeIntentGraph(intentGraph: IntentGraph, options?: { root?: string; outputDirectory?: string }): Promise<IntentGraph>;
export function buildProductionAssets(options?: {
  root?: string;
  outputDirectory?: string;
  assetsBase?: string;
  clean?: boolean;
  minify?: boolean;
  graph?: ModuleGraph;
}): Promise<ProductionAssetManifest>;
export function buildServerOutput(options?: {
  root?: string;
  outputDirectory?: string;
  clean?: boolean;
  graph?: ModuleGraph;
}): Promise<ServerOutputManifest>;
export function rewriteAssetUrls(markup: string, manifest?: ProductionAssetManifest | null): string;
export function printRouteManifest(manifest: RouteManifest): string;
