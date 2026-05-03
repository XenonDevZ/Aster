import { createNodeHandler, toFetchRequest, sendFetchResponse } from "@aster/node";
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
