import { z } from "zod";

import type { InfraiMediaClient } from "./infrai_media_client";

export const maintenanceImageRequest = z.object({
  requestId: z.string().min(1).max(80),
  propertyId: z.string().min(1).max(80),
  category: z.enum(["maintenance", "tenant_document", "inspection_reminder"]),
  image: z.string().min(1),
});

export type MaintenanceImageRequest = z.infer<typeof maintenanceImageRequest>;

export type CropPlan = {
  aspect: "4:3" | "1:1" | "16:9";
  use: "work_order" | "tenant_record" | "reminder_banner";
};

export function selectCropPlan(category: MaintenanceImageRequest["category"]): CropPlan[] {
  const shared: CropPlan = { aspect: "1:1", use: "tenant_record" };
  if (category === "maintenance") {
    return [{ aspect: "4:3", use: "work_order" }, shared];
  }
  if (category === "inspection_reminder") {
    return [shared, { aspect: "16:9", use: "reminder_banner" }];
  }
  return [shared];
}

export async function createPropertyImageVariants(
  client: Pick<InfraiMediaClient, "smartCrop">,
  input: MaintenanceImageRequest,
): Promise<{ requestId: string; propertyId: string; variants: Array<CropPlan & { image: unknown }> }> {
  const variants = await Promise.all(
    selectCropPlan(input.category).map(async (variant) => ({
      ...variant,
      image: await client.smartCrop(input.image, variant.aspect),
    })),
  );
  return { requestId: input.requestId, propertyId: input.propertyId, variants };
}
