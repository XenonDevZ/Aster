import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const JSX_RUNTIME_URL = new URL("../../aster-core/src/index.js", import.meta.url).href;
const MODULE_EXTENSIONS = [".js", ".mjs", ".jsx", ".ts", ".tsx", ".json"];
const COMPILABLE_SOURCE_EXTENSIONS = new Set([".jsx", ".ts", ".tsx", ".js", ".mjs"]);
const JSX_SOURCE_EXTENSIONS = new Set([".jsx", ".tsx"]);
const TAG_NAME = /[A-Za-z0-9_$:.-]/;
const ATTRIBUTE_NAME = /[A-Za-z0-9_:$.-]/;

class JsxSyntaxError extends SyntaxError {
  constructor(message, index) {
    super(`${message} at ${index}`);
    this.index = index;
  }
}

function isIdentifierStart(char) {
  return /[A-Za-z_$]/.test(char ?? "");
}

function skipWhitespace(source, index) {
  let cursor = index;

  while (/\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

function readQuoted(source, index) {
  const quote = source[index];
  let cursor = index + 1;

  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }

    if (source[cursor] === quote) {
      return {
        value: source.slice(index + 1, cursor),
        end: cursor + 1,
        raw: source.slice(index, cursor + 1)
      };
    }

    cursor += 1;
  }

  throw new JsxSyntaxError("Unterminated string", index);
}

function readComment(source, index) {
  if (source.startsWith("//", index)) {
    const end = source.indexOf("\n", index + 2);
    return end === -1 ? source.length : end;
  }

  if (source.startsWith("/*", index)) {
    const end = source.indexOf("*/", index + 2);
    return end === -1 ? source.length : end + 2;
  }

  return index;
}

function readTemplate(source, index) {
  let cursor = index + 1;

  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }

    if (source[cursor] === "`") {
      return cursor + 1;
    }

    cursor += 1;
  }

  throw new JsxSyntaxError("Unterminated template literal", index);
}

function readBalancedExpression(source, index) {
  let cursor = index + 1;
  let depth = 1;

  while (cursor < source.length) {
    const char = source[cursor];

    if (char === "'" || char === '"') {
      cursor = readQuoted(source, cursor).end;
      continue;
    }

    if (char === "`") {
      cursor = readTemplate(source, cursor);
      continue;
    }

    if (source.startsWith("//", cursor) || source.startsWith("/*", cursor)) {
      cursor = readComment(source, cursor);
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          expression: source.slice(index + 1, cursor),
          end: cursor + 1
        };
      }
    }

    cursor += 1;
  }

  throw new JsxSyntaxError("Unterminated JSX expression", index);
}

function readName(source, index, matcher) {
  let cursor = index;

  while (matcher.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor === index) {
    throw new JsxSyntaxError("Expected JSX name", index);
  }

  return {
    name: source.slice(index, cursor),
    end: cursor
  };
}

function normalizeText(text) {
  const collapsed = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  return collapsed ? JSON.stringify(collapsed) : null;
}

function jsxTypeExpression(name) {
  return /^[a-z]/.test(name) || name.includes("-") ? JSON.stringify(name) : name;
}

function propsExpression(attrs, spreads, children) {
  const entries = attrs.map(([name, value]) => `${JSON.stringify(name)}:${value}`);

  if (children.length === 1) {
    entries.push(`${JSON.stringify("children")}:${children[0]}`);
  } else if (children.length > 1) {
    entries.push(`${JSON.stringify("children")}:[${children.join(",")}]`);
  }

  if (spreads.length === 0) {
    return `{${entries.join(",")}}`;
  }

  const parts = ["{}"];
  let pending = [];

  for (const item of [...attrs.map((entry) => ({ type: "attr", entry })), ...spreads.map((code) => ({ type: "spread", code }))]) {
    if (item.type === "attr") {
      pending.push(`${JSON.stringify(item.entry[0])}:${item.entry[1]}`);
      continue;
    }

    if (pending.length > 0) {
      parts.push(`{${pending.join(",")}}`);
      pending = [];
    }

    parts.push(item.code);
  }

  if (children.length > 0) {
    pending.push(
      children.length === 1
        ? `${JSON.stringify("children")}:${children[0]}`
        : `${JSON.stringify("children")}:[${children.join(",")}]`
    );
  }

  if (pending.length > 0) {
    parts.push(`{${pending.join(",")}}`);
  }

  return `Object.assign(${parts.join(",")})`;
}

function parseOpening(source, index) {
  let cursor = index + 1;

  if (source[cursor] === ">") {
    return {
      type: "__asterFragment",
      fragment: true,
      selfClosing: false,
      attrs: [],
      spreads: [],
      end: cursor + 1
    };
  }

  const tag = readName(source, cursor, TAG_NAME);
  cursor = tag.end;
  const attrs = [];
  const spreads = [];

  for (;;) {
    cursor = skipWhitespace(source, cursor);

    if (source.startsWith("/>", cursor)) {
      return {
        type: jsxTypeExpression(tag.name),
        tagName: tag.name,
        fragment: false,
        selfClosing: true,
        attrs,
        spreads,
        end: cursor + 2
      };
    }

    if (source[cursor] === ">") {
      return {
        type: jsxTypeExpression(tag.name),
        tagName: tag.name,
        fragment: false,
        selfClosing: false,
        attrs,
        spreads,
        end: cursor + 1
      };
    }

    if (source.startsWith("{...", cursor)) {
      const expression = readBalancedExpression(source, cursor);
      spreads.push(`(${transformJsx(expression.expression, { injectImport: false }).code.replace(/^\.\.\./, "")})`);
      cursor = expression.end;
      continue;
    }

    const attribute = readName(source, cursor, ATTRIBUTE_NAME);
    cursor = skipWhitespace(source, attribute.end);

    if (source[cursor] !== "=") {
      attrs.push([attribute.name, "true"]);
      continue;
    }

    cursor = skipWhitespace(source, cursor + 1);

    if (source[cursor] === "'" || source[cursor] === '"') {
      const quoted = readQuoted(source, cursor);
      attrs.push([attribute.name, JSON.stringify(quoted.value)]);
      cursor = quoted.end;
      continue;
    }

    if (source[cursor] === "{") {
      const expression = readBalancedExpression(source, cursor);
      attrs.push([attribute.name, `(${transformJsx(expression.expression, { injectImport: false }).code})`]);
      cursor = expression.end;
      continue;
    }

    throw new JsxSyntaxError("Expected JSX attribute value", cursor);
  }
}

function parseClosing(source, index) {
  let cursor = index + 2;

  if (source[cursor] === ">") {
    return {
      fragment: true,
      name: null,
      end: cursor + 1
    };
  }

  const tag = readName(source, cursor, TAG_NAME);
  cursor = skipWhitespace(source, tag.end);

  if (source[cursor] !== ">") {
    throw new JsxSyntaxError("Expected JSX closing tag", cursor);
  }

  return {
    fragment: false,
    name: tag.name,
    end: cursor + 1
  };
}

function parseElement(source, index) {
  const opening = parseOpening(source, index);
  const children = [];
  let cursor = opening.end;

  if (opening.selfClosing) {
    return {
      code: `__asterJsx(${opening.type},${propsExpression(opening.attrs, opening.spreads, [])})`,
      end: cursor
    };
  }

  while (cursor < source.length) {
    if (source.startsWith("</", cursor)) {
      const closing = parseClosing(source, cursor);

      if (opening.fragment !== closing.fragment || (!opening.fragment && opening.tagName !== closing.name)) {
        throw new JsxSyntaxError("Mismatched JSX closing tag", cursor);
      }

      return {
        code: `__asterJsx(${opening.type},${propsExpression(opening.attrs, opening.spreads, children)})`,
        end: closing.end
      };
    }

    if (source[cursor] === "<") {
      const child = parseElement(source, cursor);
      children.push(child.code);
      cursor = child.end;
      continue;
    }

    if (source[cursor] === "{") {
      const expression = readBalancedExpression(source, cursor);
      const trimmed = expression.expression.trim();

      if (trimmed && !trimmed.startsWith("/*")) {
        children.push(`(${transformJsx(expression.expression, { injectImport: false }).code})`);
      }

      cursor = expression.end;
      continue;
    }

    const nextSpecial = ["<", "{"]
      .map((token) => source.indexOf(token, cursor))
      .filter((position) => position !== -1)
      .sort((left, right) => left - right)[0];
    const end = nextSpecial ?? source.length;
    const text = normalizeText(source.slice(cursor, end));

    if (text) {
      children.push(text);
    }

    cursor = end;
  }

  throw new JsxSyntaxError("Unclosed JSX element", index);
}

function readJsToken(source, index) {
  const char = source[index];

  if (char === "'" || char === '"') {
    return readQuoted(source, index).end;
  }

  if (char === "`") {
    return readTemplate(source, index);
  }

  if (source.startsWith("//", index) || source.startsWith("/*", index)) {
    return readComment(source, index);
  }

  return index + 1;
}

async function fileExists(filePath) {
  const info = await stat(filePath).catch(() => null);
  return Boolean(info?.isFile());
}

async function directoryExists(directory) {
  const info = await stat(directory).catch(() => null);
  return Boolean(info?.isDirectory());
}

async function resolveSourceSpecifier(specifier, importer) {
  const basePath = specifier.startsWith(".") ? path.resolve(path.dirname(importer), specifier) : null;

  if (!basePath) {
    return null;
  }

  if (await fileExists(basePath)) {
    return basePath;
  }

  if (!path.extname(basePath)) {
    for (const extension of MODULE_EXTENSIONS) {
      const withExtension = `${basePath}${extension}`;

      if (await fileExists(withExtension)) {
        return withExtension;
      }
    }
  }

  if (await directoryExists(basePath)) {
    for (const extension of MODULE_EXTENSIONS) {
      const indexFile = path.join(basePath, `index${extension}`);

      if (await fileExists(indexFile)) {
        return indexFile;
      }
    }
  }

  return null;
}

function removeTypeOnlyStatements(source) {
  return source
    .replace(/^\s*import\s+type\s+[\s\S]*?;\s*/gm, "")
    .replace(/^\s*export\s+type\s+[^=]+=[\s\S]*?;\s*/gm, "")
    .replace(/^\s*type\s+[^=]+=[\s\S]*?;\s*/gm, "")
    .replace(/^\s*export\s+interface\s+[^{]+{[\s\S]*?}\s*/gm, "")
    .replace(/^\s*interface\s+[^{]+{[\s\S]*?}\s*/gm, "");
}

function splitParameters(parameters) {
  const parts = [];
  let cursor = 0;
  let depth = 0;
  let index = 0;

  while (index < parameters.length) {
    const char = parameters[index];

    if (char === "'" || char === '"') {
      index = readQuoted(parameters, index).end;
      continue;
    }

    if (char === "`") {
      index = readTemplate(parameters, index);
      continue;
    }

    if (char === "<" || char === "{" || char === "[" || char === "(") {
      depth += 1;
    } else if (char === ">" || char === "}" || char === "]" || char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      parts.push(parameters.slice(cursor, index));
      cursor = index + 1;
    }

    index += 1;
  }

  parts.push(parameters.slice(cursor));
  return parts;
}

function stripParameterType(parameter) {
  const optionalParameter = parameter.replace(/([A-Za-z_$][\w$]*)\?\s*:/, "$1:");
  const colon = optionalParameter.indexOf(":");

  if (colon === -1) {
    return optionalParameter;
  }

  const equals = optionalParameter.indexOf("=", colon);

  if (equals === -1) {
    return optionalParameter.slice(0, colon).trimEnd();
  }

  return `${optionalParameter.slice(0, colon).trimEnd()} ${optionalParameter.slice(equals).trimStart()}`;
}

function stripParameterTypes(parameters) {
  return splitParameters(parameters)
    .map(stripParameterType)
    .join(",");
}

function stripFunctionTypes(source) {
  return source
    .replace(/\b(function\s+[A-Za-z_$][\w$]*)\s*<[^>\n]+>\s*\(/g, "$1(")
    .replace(/\(([^()]*)\)(\s*:\s*[^={;]+)?(\s*(?:=>|\{))/g, (_match, parameters, _returnType, suffix) => {
      return `(${stripParameterTypes(parameters)})${suffix}`;
    });
}

function stripVariableTypeAnnotations(source) {
  return source.replace(
    /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*([^=;]+?)\s*=/g,
    (_match, kind, name) => `${kind} ${name} =`
  );
}

function stripTypeAssertions(source) {
  return source
    .split("\n")
    .map((line) => {
      if (/^\s*(?:import\b|export\s*{)/.test(line)) {
        return line;
      }

      return line
        .replace(/\s+as\s+[A-Za-z_$][A-Za-z0-9_$<>,\s.[\]|&{}"']*(?=\s*[,);}\]\n])/g, "")
        .replace(/\s+satisfies\s+[A-Za-z_$][A-Za-z0-9_$<>,\s.[\]|&{}"']*(?=\s*[,);}\]\n])/g, "");
    })
    .join("\n");
}

export function transformTypeScript(source) {
  return stripTypeAssertions(stripVariableTypeAnnotations(stripFunctionTypes(removeTypeOnlyStatements(source))));
}

export function isCompilableSourceFile(filePath) {
  return COMPILABLE_SOURCE_EXTENSIONS.has(path.extname(filePath));
}

export function transformSourceModule(source, options = {}) {
  const extension = path.extname(options.filePath ?? "");
  let code = source;
  let transformed = false;

  if (extension === ".ts" || extension === ".tsx") {
    code = transformTypeScript(code);
    transformed = true;
  }

  if (JSX_SOURCE_EXTENSIONS.has(extension)) {
    const result = transformJsx(code);
    code = result.code;
    transformed ||= result.transformed;
  }

  if (options.filePath && options.root) {
    const appDirectory = path.join(options.root, "app");
    const relativePath = path.relative(appDirectory, options.filePath).split(path.sep).join("/");
    
    if (!relativePath.startsWith("../") && !path.isAbsolute(relativePath) && relativePath.startsWith("components/")) {
      const originalUrl = `/_aster/app/${relativePath.replace(/\.(?:jsx|ts|tsx)$/, ".js")}`;
      let injected = false;
      
      const namedPattern = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
      for (const match of code.matchAll(namedPattern)) {
        code += `\nif (typeof ${match[1]} !== "undefined") { ${match[1]}.__asterSource = ${JSON.stringify(originalUrl)}; ${match[1]}.__asterExport = ${JSON.stringify(match[1])}; }`;
        injected = true;
      }
      
      const defaultPattern = /export\s+default\s+(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))/;
      const defaultMatch = code.match(defaultPattern);
      if (defaultMatch) {
        const name = defaultMatch[1] || defaultMatch[2] || defaultMatch[3];
        if (name && /^[A-Za-z_$][\w$]*$/.test(name) && name !== "function" && name !== "class") {
          code += `\nif (typeof ${name} !== "undefined") { ${name}.__asterSource = ${JSON.stringify(originalUrl)}; ${name}.__asterExport = "default"; }`;
          injected = true;
        }
      }
      
      if (injected) {
        transformed = true;
      }
    }
  }

  return {
    code,
    transformed
  };
}

function compiledModuleOutput(filePath, root, outputRoot) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  const outputPath = path.join(outputRoot, `${relative}.mjs`);

  return {
    outputPath,
    outputUrl: pathToFileURL(outputPath).href
  };
}

async function rewriteCompiledImports(source, filePath, context) {
  const importPattern =
    /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g;
  let output = "";
  let cursor = 0;

  for (const match of source.matchAll(importPattern)) {
    const [full, prefix, quote, specifier] = match;
    const start = match.index;
    const end = start + full.length;
    const resolved = await resolveSourceSpecifier(specifier, filePath);
    let replacement = full;

    if (resolved) {
      if (isCompilableSourceFile(resolved)) {
        const compiled = await compileSourceModule(resolved, context);
        replacement = `${prefix}${quote}${compiled.outputUrl}${quote}`;
      } else {
        replacement = `${prefix}${quote}${pathToFileURL(resolved).href}${quote}`;
      }
    }

    output += source.slice(cursor, start);
    output += replacement;
    cursor = end;
  }

  return `${output}${source.slice(cursor)}`;
}

export function transformJsx(source, options = {}) {
  const injectImport = options.injectImport ?? true;
  let cursor = 0;
  let code = "";
  let transformed = false;

  while (cursor < source.length) {
    if (source[cursor] === "<" && (isIdentifierStart(source[cursor + 1]) || source[cursor + 1] === ">")) {
      try {
        const element = parseElement(source, cursor);
        code += element.code;
        cursor = element.end;
        transformed = true;
        continue;
      } catch (error) {
        if (!(error instanceof JsxSyntaxError)) {
          throw error;
        }
      }
    }

    const next = readJsToken(source, cursor);
    code += source.slice(cursor, next);
    cursor = next;
  }

  if (injectImport && transformed) {
    code = `import { jsx as __asterJsx, Fragment as __asterFragment } from ${JSON.stringify(JSX_RUNTIME_URL)};\n${code}`;
  }

  return {
    code,
    transformed
  };
}

export async function compileSourceModule(filePath, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputRoot = path.resolve(options.outputRoot ?? path.join(root, ".aster/compiled"));
  const cache = options.cache ?? new Map();
  const sourcePath = path.resolve(filePath);
  const cached = cache.get(sourcePath);

  if (cached?.status === "done" || cached?.status === "compiling") {
    return cached.result;
  }

  const output = compiledModuleOutput(sourcePath, root, outputRoot);
  const pending = {
    status: "compiling",
    result: {
      sourcePath,
      outputPath: output.outputPath,
      outputUrl: output.outputUrl,
      transformed: false
    }
  };

  cache.set(sourcePath, pending);

  const source = await readFile(filePath, "utf8");
  const transformed = transformSourceModule(source, { filePath, root });
  const code = await rewriteCompiledImports(transformed.code, sourcePath, {
    ...options,
    root,
    outputRoot,
    cache
  });

  await mkdir(path.dirname(output.outputPath), { recursive: true });
  await writeFile(output.outputPath, `${code.trimEnd()}\n`);

  pending.status = "done";
  pending.result = {
    ...pending.result,
    transformed: transformed.transformed
  };

  return pending.result;
}

export async function compileJsxModule(filePath, options = {}) {
  return compileSourceModule(filePath, options);
}
