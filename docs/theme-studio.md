# Theme studio

Open the faint button at the bottom left of any page, or add `?studio=1` to its URL. Drag the panel by its title; arrow keys move the focused title (Shift moves farther). The panel stays open across React Router navigation. Escape closes it without discarding the preview.

Controls preview colours, body and heading fonts, type and line-height scales, padding, gaps, and control/card corners. Reset restores the published defaults. The editor keeps its own baseline styles so experimental themes cannot obscure its controls.

Copy share link includes the current page's query filters and a versioned `theme` configuration. Only changed settings are encoded. Shared themes are validated and applied during server rendering; invalid configurations show an explanation and use defaults. Ordinary navigation preserves edits in the current tab. Reloading restores the URL configuration; settings are not saved to the server or browser storage.

Logo upload is deferred until graphics have permanent asset hosting. The panel explains this limitation. Published logos, favicons, social images, and semantic warning/error/success colours retain their defaults.

## Maintaining tokens

`app/theme/tokens.ts` owns the defaults, validation, share format, and CSS variable generation. `scripts/generate-theme.ts` generates the checked-in `app/styles/theme.css`; both `pnpm dev` and `pnpm build` regenerate it.

Tailwind v4 `@theme inline` maps utilities onto runtime variables. Use semantic roles (`bg-page`, `bg-surface`, `text-body`, `text-heading`, `text-muted`, `border-line`, `bg-primary`) and `rounded-control` / `rounded-panel` where appropriate. Default radii are zero. Harbour palette utilities remain available for tonal accents.

Padding and gap utilities use separate token scales (`px-pad-4`, `py-pad-2`, `gap-gap-4`). Do not scale Tailwind's global spacing variable: that would also resize icons, image frames, and layout widths. Type and line-height tokens likewise change text without changing the root rem size.
