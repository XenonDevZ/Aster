export type DevServerOptions = {
  root?: string;
  port?: number;
  host?: string;
  middleware?: unknown[];
  liveReload?: LiveReloadHub;
};

export type LiveReloadHub = {
  path: string;
  clients: Set<unknown>;
  response(): Response;
  broadcast(event?: string, data?: Record<string, unknown>): void;
};

export type DevServer = {
  root: string;
  port: number;
  host: string;
  url: string;
  server: unknown;
  close(): Promise<void>;
};

export function createDevHandler(options?: DevServerOptions): Promise<(request: Request) => Promise<Response>>;
export function startDevServer(options?: DevServerOptions): Promise<DevServer>;
export function createLiveReloadHub(): LiveReloadHub;
export function injectLiveReload(response: Response): Promise<Response>;
export const liveReloadRuntime: string;
export function watchProject(root: string, hub: LiveReloadHub, options?: { debounceMs?: number }): { close(): void };
export function serveFrameworkAsset(root: string, pathname: string): Promise<Response | null>;
export function servePublicAsset(root: string, pathname: string): Promise<Response | null>;
export function serveBuiltAsset(root: string, pathname: string, manifest: unknown): Promise<Response | null>;
