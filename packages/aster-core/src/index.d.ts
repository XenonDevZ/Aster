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

export type MaybePromise<T> = T | Promise<T>;
export type RouteParams = Record<string, string>;
export type RouteLocals = Record<string, unknown>;
export type RouteResult = unknown;
export type HttpMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";

export type AsterContext<
  Env = unknown,
  Locals extends RouteLocals = RouteLocals,
  Params extends object = RouteParams,
  Data = unknown
> = {
  request: Request;
  url: URL;
  params: Params;
  route: RouteDefinition<Params, Data, Env, Locals>;
  locals: Locals;
  env: Env;
  execution: unknown;
  data?: Data;
  error?: Error;
  action?: ActionManifestEntry<Params, Data, Env, Locals>;
  formData?: FormData;
};

export type RouteContext<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = Omit<AsterContext<Env, Locals, Params, Data>, "data"> & {
  data: Data;
};

export type LoaderContext<
  Params extends object = RouteParams,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = AsterContext<Env, Locals, Params, unknown>;

export type ActionContext<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = AsterContext<Env, Locals, Params, Data> & {
    formData: FormData;
    action: ActionRef<Params, Data, Env, Locals>;
  };

export type ActionHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (context: ActionContext<Params, Data, Env, Locals>) => MaybePromise<RouteResult>;

export class ActionRef<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> {
  readonly handler: ActionHandler<Params, Data, Env, Locals>;
  name?: string;
  id?: string;
  path?: string;
  routeId?: string;
  toString(): string;
}

export type ActionManifestEntry<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  id: string;
  name: string;
  path: string;
  ref: ActionRef<Params, Data, Env, Locals>;
  route?: RouteDefinition<Params, Data, Env, Locals>;
};

export type RouteHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (context: RouteContext<Params, Data, Env, Locals>) => MaybePromise<RouteResult>;

export type Loader<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (context: LoaderContext<Params, Env, Locals>) => MaybePromise<Data>;

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

export type MetaInput<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  context: RouteContext<Params, Data, Env, Locals>;
  data: Data;
  page: PageResult;
  params: Params;
  locals: Locals;
  request?: Request;
  url?: URL;
};

export type MetaHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (input: MetaInput<Params, Data, Env, Locals>) => MaybePromise<MetaResult>;

export type Middleware<
  Env = unknown,
  Locals extends RouteLocals = RouteLocals,
  Params extends object = RouteParams,
  Data = unknown
> = (
  context: AsterContext<Env, Locals, Params, Data>,
  next: () => Promise<Response>
) => MaybePromise<Response>;

export type RouteModule<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  default?: RouteHandler<Params, Data, Env, Locals>;
  DELETE?: RouteHandler<Params, Data, Env, Locals>;
  GET?: RouteHandler<Params, Data, Env, Locals>;
  HEAD?: RouteHandler<Params, Data, Env, Locals>;
  OPTIONS?: RouteHandler<Params, Data, Env, Locals>;
  PATCH?: RouteHandler<Params, Data, Env, Locals>;
  POST?: RouteHandler<Params, Data, Env, Locals>;
  PUT?: RouteHandler<Params, Data, Env, Locals>;
  load?: Loader<Params, Data, Env, Locals>;
  meta?: MetaHandler<Params, Data, Env, Locals>;
  intent?: RouteIntent;
} & Record<string, unknown>;

export type RouteDefinition<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  id?: string;
  pattern: string;
  methods?: HttpMethod[] | string[];
  intent?: RouteIntent;
  layouts?: LayoutDefinition<Params, Data, Env, Locals>[];
  errorBoundaries?: BoundaryDefinition<Params, Data, Env, Locals>[];
  loadingBoundaries?: BoundaryDefinition<Params, Data, Env, Locals>[];
  actions?: ActionManifestEntry<Params, Data, Env, Locals>[];
  load?: Loader<Params, Data, Env, Locals>;
  meta?: MetaHandler<Params, Data, Env, Locals>;
  handler?: RouteHandler<Params, Data, Env, Locals>;
  module?: RouteModule<Params, Data, Env, Locals>;
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

export type BoundaryDefinition<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  id?: string;
  filePath?: string;
  render?: ErrorBoundaryHandler<Params, Data, Env, Locals> | LoadingBoundaryHandler<Params, Data, Env, Locals>;
  module?: {
    default?: ErrorBoundaryHandler<Params, Data, Env, Locals>;
    Error?: ErrorBoundaryHandler<Params, Data, Env, Locals>;
    error?: ErrorBoundaryHandler<Params, Data, Env, Locals>;
    Loading?: LoadingBoundaryHandler<Params, Data, Env, Locals>;
    loading?: LoadingBoundaryHandler<Params, Data, Env, Locals>;
    meta?: MetaHandler<Params, Data, Env, Locals>;
  } & Record<string, unknown>;
};

export type ErrorBoundaryInput<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  error: Error;
  context: RouteContext<Params, Data, Env, Locals>;
  data?: Data;
  request?: Request;
  url?: URL;
  params: Params;
  locals: Locals;
};

export type ErrorBoundaryHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (input: ErrorBoundaryInput<Params, Data, Env, Locals>) => MaybePromise<HtmlValue | PageResult>;

export type LoadingBoundaryInput<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  context: RouteContext<Params, Data, Env, Locals>;
  data?: Data;
  request?: Request;
  url?: URL;
  params: Params;
  locals: Locals;
};

export type LoadingBoundaryHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (input: LoadingBoundaryInput<Params, Data, Env, Locals>) => MaybePromise<HtmlValue>;

export type LayoutDefinition<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  id?: string;
  filePath?: string;
  render?: LayoutHandler<Params, Data, Env, Locals>;
  module?: {
    default?: LayoutHandler<Params, Data, Env, Locals>;
    layout?: LayoutHandler<Params, Data, Env, Locals>;
    meta?: MetaHandler<Params, Data, Env, Locals>;
  } & Record<string, unknown>;
};

export type LayoutInput<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = {
  children: HtmlString | HtmlStream;
  page: PageResult;
  context: RouteContext<Params, Data, Env, Locals>;
  data?: Data;
  request?: Request;
  url?: URL;
  params: Params;
  locals: Locals;
};

export type LayoutHandler<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
> = (input: LayoutInput<Params, Data, Env, Locals>) => MaybePromise<HtmlValue | PageResult>;

export type PageResult = {
  body: HtmlString | HtmlStream;
  title: string;
  head: HtmlString;
  status: number;
  headers: HeadersInit;
};

export type AppOptions<Env = unknown, Locals extends RouteLocals = RouteLocals> = {
  routes: RouteDefinition<RouteParams, unknown, Env, Locals>[];
  middleware?: Middleware<Env, Locals>[];
  document?: (page: PageResult, context: AsterContext<Env, Locals>) => HtmlString | HtmlStream;
  notFound?: (context: Partial<AsterContext<Env, Locals>> & { request: Request; url: URL }) => MaybePromise<unknown>;
  onError?: (error: Error, context: AsterContext<Env, Locals>) => MaybePromise<unknown>;
  actionCsrf?: "lax" | "strict" | false;
  allowedActionOrigins?: string[];
  maxActionBodySize?: number | false;
};

export type AsterApp<Env = unknown, Locals extends RouteLocals = RouteLocals> = {
  routes: RouteDefinition<RouteParams, unknown, Env, Locals>[];
  router: ReturnType<typeof createRouter>;
  actions: Map<string, ActionManifestEntry<RouteParams, unknown, Env, Locals>>;
  fetch(request: Request, env?: unknown, execution?: unknown): Promise<Response>;
};

export function action<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
>(
  handler: ActionHandler<Params, Data, Env, Locals>,
  options?: { name?: string; id?: string; path?: string; routeId?: string }
): ActionRef<Params, Data, Env, Locals>;
export function bindAction<
  Params extends object = RouteParams,
  Data = unknown,
  Env = unknown,
  Locals extends RouteLocals = RouteLocals
>(
  ref: ActionRef<Params, Data, Env, Locals>,
  metadata: { id: string; name?: string; path: string; routeId?: string }
): ActionRef<Params, Data, Env, Locals>;
export function isAction(value: unknown): value is ActionRef;
export function createApp<Env = unknown, Locals extends RouteLocals = RouteLocals>(options: AppOptions<Env, Locals>): AsterApp<Env, Locals>;
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
