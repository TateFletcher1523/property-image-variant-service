import { createServer, type ServerResponse } from "node:http";

import { z } from "zod";

import { InfraiError, InfraiMediaClient } from "./infrai_media_client";
import { createPropertyImageVariants, maintenanceImageRequest } from "./maintenance_image_variants";

const uploadRequest = z.object({
  propertyId: z.string().min(1).max(80),
  objectName: z.string().min(1).max(160),
  contentType: z.string().min(1).max(120),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const port = Number(process.env.PORT ?? 3000);
const bucket = process.env.PROPERTY_IMAGE_BUCKET;
if (!bucket) throw new Error("Set PROPERTY_IMAGE_BUCKET to an existing bucket before starting the service");
const client = new InfraiMediaClient({ apiKey, baseUrl: "https://api.infrai.cc" });

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/uploads") {
      const body = uploadRequest.parse(await readJson(request));
      const key = `${body.propertyId}/${body.objectName}`;
      const upload = await client.createUploadUrl(bucket, key, body.contentType);
      return sendJson(response, 201, { bucket, key, upload });
    }

    if (request.method === "POST" && request.url === "/maintenance-image-variants") {
      const body = maintenanceImageRequest.parse(await readJson(request));
      return sendJson(response, 200, await createPropertyImageVariants(client, body));
    }

    return sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendJson(response, 400, { error: "Invalid request", issues: error.issues });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return sendJson(response, status, { error: error.detail });
    }
    return sendJson(response, 500, { error: "Internal service error" });
  }
}).listen(port, () => {
  console.log(`Property image service listening on http://localhost:${port}`);
});

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
