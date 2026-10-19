# MCP entity images

Image operations require the admin-only `mcp:write` scope and run through `execute` as `tools.siliconharbour.*`. Search for `image`, `setEntityImage`, `prepareImageUpload` or `attachImage` to discover them.

## Public image URL

Create an event and attach its cover in one execution:

```js
const created = await tools.siliconharbour.createEntity({
  type: "event",
  title: "Community workshop",
  description: "An evening of building together.",
  link: "https://example.com/workshop",
  startDate: "2026-11-20",
  startTime: "18:00",
});
return await tools.siliconharbour.setEntityImage({
  type: "event",
  id: created.entity.id,
  role: "cover",
  url: "https://example.com/workshop-cover.png",
});
```

Images must use HTTPS on port 443 without URL credentials. Every connection validates all DNS answers and uses those same answers to connect, preserving TLS hostname verification. Private, loopback, link-local, metadata, reserved and IPv6 transition addresses are rejected. Redirect targets receive the same checks; at most three redirects are allowed. The entire download has a 20-second deadline. Declared and streamed response sizes, MIME type and file signatures are checked. HTTP content encoding must be absent or identity.

## Local file

1. Call `prepareImageUpload` inside `execute`:

   ```js
   return await tools.siliconharbour.prepareImageUpload({
     filename: "cover.png",
     contentType: "image/png",
     size: 12345,
   });
   ```

   The result contains `uploadId`, `uploadUrl`, `method: "PUT"`, `headers`, and an ISO `expiresAt` timestamp.

2. Outside `execute`, use an HTTP client to PUT the exact raw file bytes to `uploadUrl`, with all returned headers. Do not send JSON, multipart data or base64. The sandbox has no `fetch`, so this request must be made by the outer client. The returned Authorization header is an upload-only capability token; it grants no MCP access. Keep it out of logs and URLs. No OAuth header is needed for this PUT.

3. Call `attachImage` inside `execute`:

   ```js
   return await tools.siliconharbour.attachImage({
     type: "event",
     id: 123,
     role: "cover",
     uploadId: "<uploadId from prepareImageUpload>",
   });
   ```

An upload expires ten minutes after preparation. Its token permits one successful PUT claim, and the uploaded file can be attached once. Invalid body data or a stalled claimed upload consumes the slot; prepare a new one to retry. Header/type/declared-length errors before claiming leave the slot available. PUT bodies have a 30-second deadline. Concurrent PUT/attach attempts cannot claim the same state twice. Invalid entity IDs or unsupported roles are checked before consuming an uploaded file.

## Supported targets

| Entity type                                           | Cover        | Icon field  |
| ----------------------------------------------------- | ------------ | ----------- |
| `event`                                               | `coverImage` | `iconImage` |
| `company`, `group`, `education`, `project`, `product` | `coverImage` | `logo`      |
| `person`                                              | Unsupported  | `avatar`    |
| `technology`                                          | Unsupported  | `icon`      |
| `news`                                                | `coverImage` | Unsupported |

Both flows accept static JPEG, PNG, WebP, GIF or AVIF images up to 5 MiB and 16 megapixels. SVGs and animated images are rejected. Covers use the existing maximum 1200 × 630 WebP processor; icons use the existing 256 × 256 crop. Metadata is stripped by the existing processing pipeline.

Attaching an image updates its filename and the entity's update timestamp, without changing visibility, review status or publication dates. Event cover attachment clears the pending imported cover URL so approval will not replace it. The result contains `type`, `id`, `role`, `filename` and the relative `/images/:filename` URL. Replaced files are removed after the row update, provided the existing orphan-image reference checker finds no remaining reference. A failed row update removes the newly processed file instead.

Temporary files and hashed upload tokens live in `DATA_DIR/mcp-uploads`, outside the public image directory, with restricted file permissions. The single Node server reserves at most 32 slots synchronously, bounding temporary image bytes to 160 MiB. Cleanup runs on startup, every minute, and before new reservations; expired slots, incomplete uploads and unused files are removed. Successful or failed attachments remove their temporary data immediately. No database migration or external storage is required.
