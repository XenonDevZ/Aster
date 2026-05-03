import { attrs, join, raw } from "file:///Users/mac/Documents/New%20project/examples/blog/packages/aster-core/src/html.js.mjs";

export const Fragment = Symbol.for("aster.jsx.fragment");

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

function childrenArray(children) {
  if (children === null || children === undefined || children === false) {
    return [];
  }

  return Array.isArray(children) ? children.flat(Infinity) : [children];
}

function styleObjectToString(style) {
  if (!style || typeof style !== "object") {
    return style;
  }

  return Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([name, value]) => `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
    .join(";");
}

function normalizeProps(props) {
  const normalized = {};

  for (const [name, value] of Object.entries(props ?? {})) {
    if (name === "children" || name === "key" || name === "ref" || name === "dangerouslySetInnerHTML") {
      continue;
    }

    if (name.startsWith("on") && typeof value === "function") {
      continue;
    }

    if (name === "className") {
      normalized.class = value;
      continue;
    }

    if (name === "htmlFor") {
      normalized.for = value;
      continue;
    }

    if (name === "style") {
      normalized.style = styleObjectToString(value);
      continue;
    }

    normalized[name] = value;
  }

  return normalized;
}

function renderElement(type, props = {}) {
  if (typeof type !== "string") {
    throw new TypeError("JSX element names must be strings or components.");
  }

  const tagName = type;

  if (!/^[A-Za-z][A-Za-z0-9:._-]*$/.test(tagName)) {
    throw new TypeError(`Invalid JSX tag name: ${tagName}`);
  }

  const attributes = attrs(normalizeProps(props));
  const innerHtml = props?.dangerouslySetInnerHTML?.__html;
  const children = innerHtml === undefined ? childrenArray(props.children) : [raw(innerHtml)];

  if (VOID_ELEMENTS.has(tagName)) {
    return raw(`<${tagName}${attributes}>`);
  }

  return join([raw(`<${tagName}${attributes}>`), join(children), raw(`</${tagName}>`)]);
}

export function jsx(type, props = {}) {
  if (type === Fragment) {
    return join(childrenArray(props.children));
  }

  if (typeof type === "function") {
    return type(props ?? {});
  }

  return renderElement(type, props ?? {});
}

export const jsxs = jsx;
export const jsxDEV = jsx;
