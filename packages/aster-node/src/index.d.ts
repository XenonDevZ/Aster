export type NodeServerOptions = {
  root?: string;
  port?: number;
  host?: string;
  middleware?: unknown[];
  actionCsrf?: "lax" | "strict" | false;
  allowedActionOrigins?: string[];
  maxActionBodySize?: number | false;
  securityHeaders?: boolean;
  contentSecurityPolicy?: string | false;
  assets?: boolean;
  assetManifestPath?: string;
  serverBuild?: boolean;
  serverManifestPath?: string;
  requireBuild?: boolean;
};

export type NodeServer = {
  root: string;
  port: number;
  host: string;
  url: string;
  server: unknown;
  close(): Promise<void>;
};

export function createNodeHandler(options?: NodeServerOptions): Promise<(request: Request) => Promise<Response>>;
export function startNodeServer(options?: NodeServerOptions): Promise<NodeServer>;
