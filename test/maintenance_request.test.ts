import assert from "node:assert/strict";
import test from "node:test";

import { createPropertyImageVariants, maintenanceImageRequest } from "../src/maintenance_image_variants";

test("an inspection reminder receives square and banner crops", async () => {
  const calls: Array<{ image: string; aspect: string }> = [];
  const client = {
    async smartCrop(image: string, aspect: string): Promise<{ ref: string }> {
      calls.push({ image, aspect });
      return { ref: `cropped:${aspect}` };
    },
  };
  const input = maintenanceImageRequest.parse({
    requestId: "inspection-204",
    propertyId: "building-7",
    category: "inspection_reminder",
    image: "stored-image-204",
  });

  const result = await createPropertyImageVariants(client, input);

  assert.deepEqual(calls, [
    { image: "stored-image-204", aspect: "1:1" },
    { image: "stored-image-204", aspect: "16:9" },
  ]);
  assert.deepEqual(
    result.variants.map(({ aspect, use }) => ({ aspect, use })),
    [
      { aspect: "1:1", use: "tenant_record" },
      { aspect: "16:9", use: "reminder_banner" },
    ],
  );
});

test("the request boundary rejects an unknown property workflow", () => {
  const parsed = maintenanceImageRequest.safeParse({
    requestId: "x",
    propertyId: "building-7",
    category: "listing",
    image: "stored-image-204",
  });
  assert.equal(parsed.success, false);
});
