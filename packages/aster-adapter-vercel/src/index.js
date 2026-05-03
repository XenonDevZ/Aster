import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function adapt(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? ".aster/output";
  const vercelDirectory = path.join(root, ".vercel/output");

  console.log("[aster] building vercel adapter...");

  // Clean previous output
  await rm(vercelDirectory, { recursive: true, force: true });
  await mkdir(vercelDirectory, { recursive: true });

  // Create Vercel config.json
  // Route all traffic to our single serverless function, EXCEPT static assets which are handled automatically by Vercel
  const config = {
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/" }
    ]
  };
  await writeFile(path.join(vercelDirectory, "config.json"), JSON.stringify(config, null, 2));

  // Copy public assets
  const staticDir = path.join(vercelDirectory, "static");
  await mkdir(staticDir, { recursive: true });

  const publicDir = path.join(root, "public");
  await cp(publicDir, staticDir, { recursive: true, force: true }).catch(() => null);

  const assetsDir = path.join(root, outputDirectory, "assets");
  await cp(assetsDir, path.join(staticDir, "_aster/assets"), { recursive: true, force: true }).catch(() => null);

  // Setup Serverless Function
  const functionDir = path.join(vercelDirectory, "functions/index.func");
  await mkdir(functionDir, { recursive: true });

  // .vc-config.json
  const vcConfig = {
    runtime: "nodejs20.x",
    handler: "index.js",
    launcherType: "Nodejs"
  };
  await writeFile(path.join(functionDir, ".vc-config.json"), JSON.stringify(vcConfig, null, 2));

  // Copy server output
  const serverOutput = path.join(root, outputDirectory, "server");
  await cp(serverOutput, path.join(functionDir, "server"), { recursive: true, force: true });

  // Generate entrypoint
  const entrypoint = `import { createNodeHandler, toFetchRequest, sendFetchResponse } from "@aster/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "server");

// We cache the handler so it's only created once per serverless execution environment
let handler;

export default async function(req, res) {
  try {
    if (!handler) {
      handler = await createNodeHandler({ root });
    }

    const port = req.headers["x-forwarded-port"] || 443;
    const fetchRequest = toFetchRequest(req, port);
    const fetchResponse = await handler(fetchRequest);
    
    await sendFetchResponse(res, fetchResponse);
  } catch (error) {
    res.statusCode = 500;
    res.end("Internal Server Error");
    console.error("[aster/vercel] Uncaught error:", error);
  }
}
`;
  await writeFile(path.join(functionDir, "index.js"), entrypoint);
  
  // Write a basic package.json so the function knows it's ESM
  await writeFile(path.join(functionDir, "package.json"), JSON.stringify({ type: "module" }, null, 2));

  console.log("[aster] vercel adapter build complete.");
}
