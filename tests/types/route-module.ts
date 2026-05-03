import { action, html, page } from "../../packages/aster-core/src/index.js";
import type {
  ErrorBoundaryHandler,
  LayoutHandler,
  Loader,
  LoadingBoundaryHandler,
  MetaHandler,
  RouteHandler,
  RouteModule
} from "../../packages/aster-core/src/index.js";

type Params = {
  slug: string;
};

type Post = {
  title: string;
  excerpt: string;
};

type Data = {
  post: Post;
};

type Env = {
  posts: {
    find(slug: string): Promise<Post>;
  };
};

type Locals = {
  requestId: string;
};

export const load: Loader<Params, Data, Env, Locals> = async ({ env, locals, params }) => {
  const post = await env.posts.find(params.slug);

  return {
    post: {
      ...post,
      excerpt: `${post.excerpt} (${locals.requestId})`
    }
  };
};

export const meta: MetaHandler<Params, Data, Env, Locals> = ({ data, params }) => ({
  title: `${data.post.title} | ${params.slug}`,
  description: data.post.excerpt
});

export const saveComment = action<Params, Data, Env, Locals>(async ({ formData, params }) => {
  return {
    ok: true,
    slug: params.slug,
    body: String(formData.get("body") ?? "")
  };
});

export const GET: RouteHandler<Params, Data, Env, Locals> = ({ data, locals, params }) => {
  return page(html`
    <article data-request="${locals.requestId}">
      <h1>${data.post.title}</h1>
      <p>${params.slug}</p>
    </article>
  `);
};

export const POST: RouteHandler<Params, Data, Env, Locals> = ({ data }) => {
  return {
    title: data.post.title
  };
};

export const layout: LayoutHandler<Params, Data, Env, Locals> = ({ children, data }) => {
  return html`<main data-post="${data?.post.title ?? ""}">${children}</main>`;
};

export const loading: LoadingBoundaryHandler<Params, Data, Env, Locals> = ({ params }) => {
  return html`<p>Loading ${params.slug}</p>`;
};

export const error: ErrorBoundaryHandler<Params, Data, Env, Locals> = ({ error, params }) => {
  return page(html`<h1>${params.slug}: ${error.message}</h1>`, {
    status: 500,
    title: "Route error"
  });
};

export const route = {
  GET,
  POST,
  load,
  meta,
  saveComment,
  intent: {
    actions: ["saveComment"]
  }
} satisfies RouteModule<Params, Data, Env, Locals>;
