# Theme studio

Open the faint 🎨 button at the bottom left of any page, or add `?studio=1` to its URL. Drag the panel by its title; arrow keys move the focused title (Shift moves farther). On `/design`, the site header stays visible above a split workspace: the studio scrolls on the left and examples scroll on the right. On small screens, the controls stack above the examples. The studio is always shown there; navigating elsewhere restores the floating panel. The panel stays open across React Router navigation. Escape closes it without discarding the preview.

Colours use OKLCH. The main colour drives the harbour ramp and its semantic roles (body 600, headings 700, muted 500, borders 200); white surfaces and status colours remain neutral. Edit individual ramp stops to set their lightness, chroma and hue offsets from the main colour. Stops follow later changes to the main colour. Individual roles can be overridden; clearing an override relinks it. Colours outside sRGB are indicated and rendered using the browser’s gamut mapping.

Font fields offer presets and accept arbitrary Google Fonts family names. Apply commits the draft and loads the selected regular faces through the Google Fonts CSS API; heavier styles may be synthesized by the browser. System presets need no extra font request. Missing families or failed font requests explain that the fallback font is shown.

Other controls preview type and line-height scales, padding, gaps, and control/card corners. Reset restores the published defaults. The editor keeps its own baseline styles so experimental themes cannot obscure its controls.

Copy share link includes the current page's query filters and a versioned `theme` configuration. Only changed settings are encoded. The OKLCH format is version 2; earlier version 1 links load defaults with an unsupported-link notice. Shared themes are validated and applied during server rendering; invalid configurations show an explanation and use defaults. Ordinary navigation preserves edits in the current tab. Reloading restores the URL configuration; settings are not saved to the server or browser storage.

Logo upload is deferred until graphics have permanent asset hosting. The panel explains this limitation. Published logos, favicons, social images, and semantic warning/error/success colours retain their defaults.

## Maintaining tokens

`app/theme/colors.ts` owns the OKLCH model, ramp relationships and role resolution; `fonts.ts` owns safe font names, stacks and stylesheet URLs. `tokens.ts` composes the theme schema, defaults, sharing format and CSS variable generation. Culori handles conversion of the original published hex palette and gamut checks. `scripts/generate-theme.ts` generates the checked-in `app/styles/theme.css`; both `pnpm dev` and `pnpm build` regenerate it.

Tailwind v4 `@theme inline` maps utilities onto runtime variables. Use semantic roles (`bg-page`, `bg-surface`, `text-body`, `text-heading`, `text-muted`, `border-line`, `bg-primary`) and `rounded-control` / `rounded-panel` where appropriate. Default radii are zero. Harbour palette utilities remain available for tonal accents.

Padding and gap utilities use separate token scales (`px-pad-4`, `py-pad-2`, `gap-gap-4`). Do not scale Tailwind's global spacing variable: that would also resize icons, image frames, and layout widths. Type and line-height tokens likewise change text without changing the root rem size.

Use `card-surface` for a framed panel and `card-link` for an interactive card. They share the surface, border role and panel radius; entity-specific content stays in its own component. Recurring event stacks use `--theme-stack-step` (3px at default gap density), including rounded background layers. Cover insets follow padding density and clip to the card frame.

The live component section on `/design` reuses `EventCard`, `CompanyCard`, `CompanyJobCard`, `JobRow`, `BaseMultiSelect`, `Calendar` and `NewsListing`. Event examples are fixed fixtures; company, job and news examples use a small sample of published content. Keep these examples tied to production components when adding new patterns.

Appearance controls add border contrast (blending the border role toward body text), border width, card outline opacity, panel shadows, card hover lift, image tint and letter spacing. Shadows use the heading colour with independently adjustable opacity, blur, offset and spread; default opacity is zero. Width applies to card outlines and semantic `border-line` borders, preserving focus indicators and status-colour borders. `rounded-panel` surfaces share elevation; recurring background layers stay flat. Hover lift is disabled for reduced-motion users. Image tint affects `TintedImage` photos, with the existing hover reveal retained. All values are bounded and included in version 2 share links; older version 2 links receive the new defaults.

The studio starts in Simple mode with the main colour, fonts, type size, padding, card corners, border contrast and shadow opacity. Advanced mode groups the remaining controls into disclosures. Switching modes keeps every setting, including advanced settings hidden in Simple mode. The selected mode follows navigation in the current tab but is not part of a shared theme. Reset and sharing remain available below the scrolling controls.
