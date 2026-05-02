export class HtmlString {
  readonly value: string;
  toString(): string;
}

export class HtmlStream {
  readonly values: unknown;
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;
  toString(): never;
}

export type HtmlValue = HtmlString | HtmlStream | string | number | boolean | null | undefined | HtmlValue[];

export class DeferredData<T = unknown> {
  readonly promise: Promise<T>;
  fallback?: HtmlValue | Promise<HtmlValue>;
  name?: string;
}

export type AsterContext<Env = unknown, Locals extends Record<string, unknown> = Record<string, unknown>> = {
  request: Request;
  url: URL;
  params: Record<string, string>;
  route: RouteDefinition;
  locals: Locals;
  env: Env;
  execution: unknown;
  data?: unknown;
  error?: Error;
  action?: ActionManifestEntry;
  formData?: FormData;
};

export type ActionHandler = (
  context: AsterContext & {
    formData: FormData;
    action: ActionRef;
  }
) => Response | HtmlValue | PageResult | unknown | Promise<Response | HtmlValue | PageResult | unknown>;

export class ActionRef {
  readonly handler: ActionHandler;
  name?: string;
  id?: string;
  path?: string;
  routeId?: string;
  toString(): string;
}

export type ActionManifestEntry = {
  id: string;
  name: string;
  path: string;
  ref: ActionRef;
  route?: RouteDefinition;
};

export type RouteHandler = (context: AsterContext) => Response | HtmlValue | PageResult | unknown | Promise<Response | HtmlValue | PageResult | unknown>;
export type Loader = (context: AsterContext) => unknown | Promise<unknown>;
export type MetaResult =
  | string
  | HtmlString
  | {
      title?: string;
      description?: string;
      meta?: Array<Record<string, string | number | boolean | null | undefined>> | Record<string, string | number | boolean | null | undefined>;
      links?: Array<Record<string, string | number | boolean | null | undefined>> | Record<string, string | number | boolean | null | undefined>;
      link?: Array<Record<string, string | number | boolean | null | undefined>> | Record<string, string | number | boolean | null | undefined>;
      head?: HtmlValue;
    };
export type MetaHandler = (input: {
  context: AsterContext;
  data: unknown;
  page: PageResult;
  params: Record<string, string>;
  locals: Record<string, unknown>;
  request?: Request;
  url?: URL;
}) => MetaResult | Promise<MetaResult>;

export type Middleware = (
  context: AsterContext,
  next: () => Promise<Response>
) => Response | Promise<Response>;

export type RouteDefinition = {
  id?: string;
  pattern: string;
  methods?: string[];
  layouts?: LayoutDefinition[];
  errorBoundaries?: BoundaryDefinition[];
  loadingBoundaries?: BoundaryDefinition[];
  actions?: ActionManifestEntry[];
  load?: Loader;
  meta?: MetaHandler;
  handler?: RouteHandler;
  module?: Record<string, RouteHandler | Loader | MetaHandler | unknown>;
};

export type BoundaryDefinition = {
  id?: string;
  filePath?: string;
  render?: ErrorBoundaryHandler | LoadingBoundaryHandler;
  module?: {
    default?: ErrorBoundaryHandler;
    Error?: ErrorBoundaryHandler;
    error?: ErrorBoundaryHandler;
    Loading?: LoadingBoundaryHandler;
    loading?: LoadingBoundaryHandler;
    meta?: MetaHandler;
  } & Record<string, unknown>;
};

export type ErrorBoundaryHandler = (input: {
  error: Error;
  context: AsterContext;
  data?: unknown;
  request?: Request;
  url?: URL;
  params: Record<string, string>;
  locals: Record<string, unknown>;
}) => HtmlValue | PageResult | Promise<HtmlValue | PageResult>;

export type LoadingBoundaryHandler = (input: {
  context: AsterContext;
  data?: unknown;
  request?: Request;
  url?: URL;
  params: Record<string, string>;
  locals: Record<string, unknown>;
}) => HtmlValue | Promise<HtmlValue>;

export type LayoutDefinition = {
  id?: string;
  filePath?: string;
  render?: LayoutHandler;
  module?: {
    default?: LayoutHandler;
    layout?: LayoutHandler;
    meta?: MetaHandler;
  } & Record<string, unknown>;
};

export type LayoutHandler = (input: {
  children: HtmlString | HtmlStream;
  page: PageResult;
  context: AsterContext;
  data?: unknown;
  request?: Request;
  url?: URL;
  params: Record<string, string>;
  locals: Record<string, unknown>;
}) => HtmlValue | PageResult | Promise<HtmlValue | PageResult>;

export type PageResult = {
  body: HtmlString | HtmlStream;
  title: string;
  head: HtmlString;
  status: number;
  headers: HeadersInit;
};

export type AppOptions = {
  routes: RouteDefinition[];
  middleware?: Middleware[];
  document?: (page: PageResult, context: AsterContext) => HtmlString | HtmlStream;
  notFound?: (context: Partial<AsterContext> & { request: Request; url: URL }) => unknown | Promise<unknown>;
  onError?: (error: Error, context: AsterContext) => unknown | Promise<unknown>;
  actionCsrf?: "lax" | "strict" | false;
  allowedActionOrigins?: string[];
  maxActionBodySize?: number | false;
};

export type AsterApp = {
  routes: RouteDefinition[];
  router: ReturnType<typeof createRouter>;
  actions: Map<string, ActionManifestEntry>;
  fetch(request: Request, env?: unknown, execution?: unknown): Promise<Response>;
};

export function action(handler: ActionHandler, options?: { name?: string; id?: string; path?: string; routeId?: string }): ActionRef;
export function bindAction(ref: ActionRef, metadata: { id: string; name?: string; path: string; routeId?: string }): ActionRef;
export function isAction(value: unknown): value is ActionRef;
export function createApp(options: AppOptions): AsterApp;
export function defer<T>(value: T | Promise<T>, options?: { fallback?: HtmlValue | Promise<HtmlValue>; name?: string }): DeferredData<T>;
export function isDeferred(value: unknown): value is DeferredData;
export function setDeferredFallback(value: unknown, fallback: HtmlValue | Promise<HtmlValue>): unknown;
export function renderDeferred<T>(
  value: DeferredData<T> | Promise<T> | T,
  render: (value: T) => HtmlValue | Promise<HtmlValue>,
  fallback?: HtmlValue | Promise<HtmlValue>
): HtmlValue;
export function applyMetadata(page: PageResult, context?: Partial<AsterContext> & { layouts?: LayoutDefinition[] }): Promise<PageResult>;
export const Fragment: symbol;
export function jsx(type: string | symbol | ((props: Record<string, unknown>) => HtmlValue), props?: Record<string, unknown>): HtmlValue;
export const jsxs: typeof jsx;
export const jsxDEV: typeof jsx;
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): HtmlString | HtmlStream;
export function raw(value: unknown): HtmlString;
export function isHtml(value: unknown): value is HtmlString;
export function isHtmlStream(value: unknown): value is HtmlStream;
export function stream(values: Iterable<HtmlValue | Promise<HtmlValue>> | AsyncIterable<HtmlValue | Promise<HtmlValue>> | HtmlValue): HtmlStream;
export function toReadableStream(value: HtmlValue): ReadableStream<Uint8Array>;
export function join(values: HtmlValue[], separator?: string): HtmlString | HtmlStream;
export function attrs(attributes: Record<string, string | number | boolean | null | undefined>): HtmlString;
export function escapeHtml(value: unknown): string;
export function escapeAttribute(value: unknown): string;
export function island(
  component: string | { src: string; exportName?: string; export?: string },
  props?: Record<string, unknown>,
  fallback?: HtmlValue
): HtmlString;
export const islandRuntime: HtmlString;
export const navigationRuntime: HtmlString;
export function page(body: HtmlValue, options?: Partial<Omit<PageResult, "body" | "head">> & { head?: HtmlValue }): PageResult;
export function isPage(value: unknown): value is PageResult;
export function applyPageLayouts(page: PageResult, context?: Partial<AsterContext> & { layouts?: LayoutDefinition[] }): Promise<PageResult>;
export function preparePage(page: PageResult, context?: Partial<AsterContext> & { layouts?: LayoutDefinition[] }): Promise<PageResult>;
export function renderDocument(page: PageResult): HtmlString | HtmlStream;
export function htmlResponse(body: HtmlString | HtmlStream, init?: ResponseInit): Response;
export function json(data: unknown, init?: ResponseInit): Response;
export function redirect(
  location: string,
  status?: number,
  options?: { fallback?: string; allowExternal?: boolean }
): Response;
export function safeRedirect(
  location: string,
  status?: number | { fallback?: string; allowExternal?: boolean },
  options?: { fallback?: string; allowExternal?: boolean }
): Response;
export function text(body: unknown, init?: ResponseInit): Response;
export function toResponse(value: unknown, context?: Partial<AsterContext>): Promise<Response>;
export function compileRoute(pattern: string): { pattern: string; keys: string[]; regex: RegExp; score: number };
export function createRouter(routes: RouteDefinition[]): {
  routes: RouteDefinition[];
  match(pathname: string): { route: RouteDefinition; params: Record<string, string> } | null;
};
