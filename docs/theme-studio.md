# Theme studio

Open the faint 🎨 button at the bottom left of any page, or add `?studio=1` to its URL. Drag the panel by its title; arrow keys move the focused title (Shift moves farther). On `/design`, the site header stays visible above a split workspace: the studio scrolls on the left and examples scroll on the right. On small screens, the controls stack above the examples. The studio is always shown there; navigating elsewhere restores the floating panel. The panel stays open across React Router navigation. Escape closes it without discarding the preview.

Colours use OKLCH. The main colour drives the harbour ramp and its semantic roles (body 600, headings 700, muted 500, borders 200); white surfaces and status colours remain neutral. Edit individual ramp stops to set their lightness, chroma and hue offsets from the main colour. Stops follow later changes to the main colour. Individual roles can be overridden; clearing an override relinks it. Colours outside sRGB are indicated and rendered using the browser’s gamut mapping.

Font fields offer presets and accept arbitrary Google Fonts family names. Apply commits the draft and loads the selected regular faces through the Google Fonts CSS API; heavier styles may be synthesized by the browser. System presets need no extra font request. Missing families or failed font requests explain that the fallback font is shown.

Other controls preview type and line-height scales, padding, gaps, and control/card corners. Reset restores the published defaults. The editor keeps its own baseline styles so experimental themes cannot obscure its controls.

Themes and logos are saved as named drafts in localStorage. Reloading restores the selected draft; New, Make a copy and the theme picker let you try several directions. Removing a local draft does not delete its published share. Storage errors are shown in the studio.

Create share link explicitly uploads a snapshot and returns `/design/share/:id`. Theme configuration is no longer carried in query parameters. Visitors receive the saved theme and logo together, including during server rendering, and can make their own copy. The creating browser stores a private edit key alongside its draft; Update shared theme publishes changes to the same link. Unpublished edits stay local. Revision checks prevent an older draft from overwriting a newer published revision. Clearing browser storage or removing the owning draft loses editing access; there is no account or recovery flow.

Choose an SVG, PNG, JPEG, WebP, GIF or AVIF logo up to 5 MB and 16 megapixels. SVGs must be static and self-contained; scripts, external references and embedded images are rejected. The browser flattens the image to PNG at a maximum 1024px dimension and 512 KiB. The logo replaces the header graphic and appears in downloadable design-page social images. Reset or Use original logo clears it. Favicons and published social images keep their original branding.

## Share storage and moderation

Shares store the validated theme, normalized PNG, revision, creation/update timestamps and IP addresses in SQLite. Only a hash of the edit key is stored. Public responses exclude edit keys and IP metadata. The server accepts PNG bytes, never a remote image URL, and verifies format and dimensions before saving. Shared links are public and excluded from indexing.

Writes require a same-origin request and are limited to 5 attempts per 10 minutes and 20 per day per IP, including invalid submissions. IP addresses come from the HTTP adapter's configured proxy trust, not client-supplied route headers. Total storage is capped at 10,000 shares and 200 MiB of logos. `/manage/theme-shares` lists shares, timestamps and creation/update IPs and can delete a share together with its logo. Authenticated admin MCP operations provide the same listing and deletion. Local browser copies survive server deletion.

Migration `0058_theme_shares` must be applied in production by the operator after deployment; use the repository's production migration workflow. Development migration has been verified locally.

## Maintaining tokens

`app/theme/colors.ts` owns the OKLCH model, ramp relationships and role resolution; `fonts.ts` owns safe font names, stacks and stylesheet URLs. `tokens.ts` composes the theme schema, defaults and CSS variable generation. Culori handles conversion of the original published hex palette and gamut checks. `scripts/generate-theme.ts` generates the checked-in `app/styles/theme.css`; both `pnpm dev` and `pnpm build` regenerate it.

Tailwind v4 `@theme inline` maps utilities onto runtime variables. Use semantic roles (`bg-page`, `bg-surface`, `text-body`, `text-heading`, `text-muted`, `border-line`, `bg-primary`) and `rounded-control` / `rounded-panel` where appropriate. Default radii are zero. Harbour palette utilities remain available for tonal accents.

Padding and gap utilities use separate token scales (`px-pad-4`, `py-pad-2`, `gap-gap-4`). Do not scale Tailwind's global spacing variable: that would also resize icons, image frames, and layout widths. Type and line-height tokens likewise change text without changing the root rem size.

Use `card-surface` for a framed panel and `card-link` for an interactive card. They share the surface, border role and panel radius; entity-specific content stays in its own component. Recurring event stacks use `--theme-stack-step` (3px at default gap density), including rounded background layers. Cover insets follow padding density and clip to the card frame.

The live component section on `/design` reuses `EventCard`, `CompanyCard`, `CompanyJobCard`, `JobRow`, `BaseMultiSelect`, `Calendar` and `NewsListing`. Event examples are fixed fixtures; company, job and news examples use a small sample of published content. Keep these examples tied to production components when adding new patterns.

Appearance controls add border contrast (blending the border role toward body text), border width, card outline opacity, panel shadows, card hover lift, image tint and letter spacing. Shadows use the heading colour with independently adjustable opacity, blur, offset and spread; default opacity is zero. Width applies to card outlines and semantic `border-line` borders, preserving focus indicators and status-colour borders. `rounded-panel` surfaces share elevation; recurring background layers stay flat. Hover lift is disabled for reduced-motion users. Image tint affects `TintedImage` photos, with the existing hover reveal retained. All values are bounded and included in saved theme snapshots.

The main colour, typography, spacing, borders, shadows and logo sections open by default. Each section has an icon button that restores its published defaults, including its advanced settings, without changing other sections. One Advanced accordion at the bottom holds ramp and role overrides, extra typography controls, spacing details, shadow parameters and effects. Local theme management remains collapsed. There is no global Simple/Advanced mode. Reset theme at the top restores all styles and the original logo while retaining the draft and share identity. Themes contains the local picker, name, New, Duplicate and Remove local. The footer has one Share action, changing to Update link or Copy link for an owned share; copying shows the URL only when clipboard access fails.

Scale controls show a CSS reference value beside the multiplier, with published defaults underneath. Padding and gaps use spacing step 4 (1rem by default); Advanced includes a table of common spacing steps. Rem values also show CSS pixels based on the browser’s root font size. Letter spacing shows em and its pixel equivalent relative to the current body size.

Zero elevation is a transparent zero-size shadow, so it can compose with Tailwind ring outlines. Do not use `none` inside a combined shadow list: it invalidates the outline too. Grouped job cards keep their original solid outline; ordinary cards use half opacity and recurring middle layers use 70% by default. The company selector keeps harbour 300 borders unless the border role is overridden.

## Local graphic and social previews

Files remain in the browser until Create share link or Update shared theme uploads the normalized PNG. Shared snapshots include the logo, so visitors can generate the same social previews. Social previews can be downloaded as 1200 × 630 PNG files.

The existing OG routes accept the fixed `preview=template` flag. Their normal Satori layout produces a self-contained SVG with an invisible logo and supplies that logo’s exact layout bounds via `onNodeDetected`. These responses are JSON with `Cache-Control: no-store`; ordinary published PNG requests and their caches retain their behavior. The server reads only its existing local assets and accepts no uploaded file or logo URL. The browser composites the flattened logo into that slot using Canvas, with no WASM dependency or server-side remote-image fetching. Published colours, Inter typography and layout remain in the OG template; other studio style controls apply to the site itself.

File processing and preview rendering guard against stale asynchronous results. Reset invalidates pending file reads; changed or unmounted previews abort template requests and revoke their object URLs. Rendering errors offer a retry instead of silently showing the published logo.
