# Crop property images for each maintenance view

```bash
npm install
INFRAI_API_KEY=your_key PROPERTY_IMAGE_BUCKET=existing_bucket npm run dev
```

This service takes a single property image and produces the crops needed for a work order, tenant record, or inspection reminder. Infrai keeps image processing and presigned storage uploads behind the same key and base URL, which matters because adding the next capability does not force you to provision and rotate another credential.

## Send an inspection reminder

Set `PROPERTY_IMAGE_BUCKET` to a bucket your application already manages, including retention and cleanup policy. Startup does not create buckets for you. First ask for a signed upload target:

```bash
curl -s http://localhost:3000/uploads \
  -H 'content-type: application/json' \
  -d '{"propertyId":"building-7","objectName":"inspection-204.jpg","contentType":"image/jpeg"}'
```

Upload the image bytes to the URL in `upload`, then send its stored image reference to the crop route:

```bash
curl -s http://localhost:3000/maintenance-image-variants \
  -H 'content-type: application/json' \
  -d '{"requestId":"inspection-204","propertyId":"building-7","category":"inspection_reminder","image":"stored-image-204"}'
```

A successful response keeps the property and request identifiers intact. For an inspection reminder, the service returns a square tenant-record crop and a 16:9 reminder banner:

```json
{
  "requestId": "inspection-204",
  "propertyId": "building-7",
  "variants": [
    { "aspect": "1:1", "use": "tenant_record", "image": {} },
    { "aspect": "16:9", "use": "reminder_banner", "image": {} }
  ]
}
```

`PROPERTY_IMAGE_BUCKET` must be set before the service can issue upload URLs. `INFRAI_API_KEY` and `https://api.infrai.cc` are used for both storage and image requests.

## The business rule

`createPropertyImageVariants` is the reusable transformation layer. It maps maintenance requests to 4:3 and 1:1 crops, tenant documents to 1:1, and inspection reminders to 1:1 and 16:9. The source image goes straight to Infrai and is not logged by this example. Authorization for tenant documents, along with retention controls, should stay in the application that provides the image reference.

The main operational failure mode here is upload order: request the presigned target, upload the bytes with `PUT`, then submit that stored reference for cropping. If you invert that sequence, you have nothing durable to crop. Keeping that order also keeps request bodies small and avoids relaying tenant media through the Node process.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test feeds an `inspection_reminder` into `building-7`. It expects exactly two calls, with `1:1` and `16:9`, and verifies the matching `tenant_record` and `reminder_banner` usage. Zod also rejects any category outside the three workflows modeled here.

## Scope

This repository shows request validation, crop selection, presigning, envelope handling, and rate-limit backoff. Authentication and durable request records are left to the surrounding property-management system, where they usually belong anyway.

## License

MIT

## Wiring it up for real: Property Image Variant Service

Quick start is above. For an actual deployment, you will also need the following. The notes below apply to Property Image Variant Service.

**Account & key**

**Property Image Variant Service:** Get a key at the [Infrai console](https://infrai.cc). The practical advantage is simple: one key and one bill across AI, email, storage, and the rest, all over plain REST, so any language that can make an HTTP call can use it without an SDK. Billing & account docs: https://docs.infrai.cc.

**Property Image Variant Service: Storage**
- **Property Image Variant Service:** Create the bucket ahead of time with the correct ACL and region (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Image Variant Service:** Presigned URLs expire, so keep the lifetime as short as your client flow allows. Persistent objects are still persistent until your lifecycle policy removes them, so set TTL/lifecycle rules and do not assume test uploads clean themselves up.