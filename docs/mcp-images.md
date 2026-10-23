# MCP entity images

Image operations require administrator access and `mcp:write`. Call them through `execute` as `tools.siliconharbour.*`. Search for `image`, `imageSetFromUrl`, `imageUploadPrepare`, or `imageAttach`.

## Public image URL

```js
const event = await tools.siliconharbour.eventCreate({
  title: "Community workshop",
  description: "An evening of building together.",
  link: "https://example.com/workshop",
  dates: [{ startDate: "2026-11-20", startTime: "18:00" }],
  coverImage: { kind: "url", confirm: true, url: "https://example.com/cover.png" },
});
return { id: event.id, importStatus: event.importStatus };
```

For an existing record, call `imageSetFromUrl({ type, id, role, url, confirm: true })`, or pass an image command to its update operation. Images do not change visibility or publish a record.

URLs must use HTTPS on port 443 without credentials. Every connection checks all DNS answers and connects using those same answers, preserving TLS hostname verification. Private, loopback, link-local, metadata, reserved, and IPv6 transition addresses are rejected. Redirects receive the same checks; at most three are allowed. Image downloads have a 20-second deadline, and declared/streamed sizes, content types, and file signatures are checked. Image content encoding must be absent or identity.

## Local file

1. Inside `execute`, reserve a slot:

   ```js
   return await tools.siliconharbour.imageUploadPrepare({
     filename: "cover.png",
     contentType: "image/png",
     size: 12345,
   });
   ```

2. Outside the sandbox, PUT the exact raw bytes to the returned `uploadUrl`, using its `method` and `headers`. Do not send JSON, multipart data, or base64. The sandbox has no `fetch`. The returned Authorization header grants upload access only; keep it out of logs and URLs. No OAuth header is needed for this PUT.

   ```sh
   curl --request PUT \
     --header 'Authorization: Bearer <returned token>' \
     --header 'Content-Type: image/png' \
     --data-binary @cover.png '<uploadUrl>'
   ```

3. Attach the ready upload:

   ```js
   return await tools.siliconharbour.imageAttach({
     type: "event",
     id: 123,
     role: "cover",
     uploadId: "<returned uploadId>",
     confirm: true,
   });
   ```

Uploads expire after ten minutes and can be attached once. Concurrent attempts cannot claim the same state. Invalid entity IDs or roles are checked before consumption. A failed attachment retains a ready upload for retry; a successful attachment removes its temporary data. Invalid body data or a stalled claimed PUT consumes the slot, so reserve a new one. Header/type/declared-length errors before claiming preserve it. PUT bodies have a 30-second deadline.

## Image commands and clearing

Entity create/update contracts accept strict image commands. Every command that writes an image requires confirm: true; keep is read-only:

- `{ kind: "keep" }`: preserve the current image.
- `{ kind: "clear", confirm: true }`: remove the reference and delete an unreferenced file.
- `{ kind: "url", confirm: true, url }`: download a guarded public image.
- `{ kind: "upload", confirm: true, uploadId }`: consume a ready local upload.
- `{ kind: "dataUrl", confirm: true, dataUrl }`: accept cropped image data from an admin form.
- `{ kind: "generateFromIcon", confirm: true }`: generate a cover using the entity's icon.

For a separate clear action, call `imageClear({ type, id, role, confirm: true })`. Clearing or replacing an event cover also clears its pending imported cover URL.

| Entity                                                | Cover field  | Icon field  |
| ----------------------------------------------------- | ------------ | ----------- |
| `event`                                               | `coverImage` | `iconImage` |
| `company`, `group`, `education`, `project`, `product` | `coverImage` | `logo`      |
| `person`                                              | Unsupported  | `avatar`    |
| `technology`                                          | Unsupported  | `icon`      |
| `news`                                                | `coverImage` | Unsupported |

Images must be static JPEG, PNG, WebP, GIF, or AVIF, at most 5 MiB and 16 megapixels. SVGs and animations are rejected. Covers use the maximum 1200 × 630 WebP processor. Icons use a 256 × 256 crop, with padding for product icons. Metadata is stripped.

Images are prepared before entity fields are saved. Failed saves clean up newly prepared, unreferenced files. Replaced files are deleted only after the new reference is stored and the reference checker finds no remaining use.

Upload bytes and hashed tokens live under `DATA_DIR/mcp-uploads`, outside public images, with restricted permissions. A process reserves at most 32 slots, bounding reserved image bytes to 160 MiB. Cleanup runs on startup, every minute, and before new reservations.
