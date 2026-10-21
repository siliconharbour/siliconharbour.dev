# Default theme comparison

Compared the current default theme against the card and selector styles in `0105f28`, before the shared-card migration. The event outline styles also agree with the version before the initial token migration (`2b34e17^`).

## Regressions found

- The zero-elevation token was `none`. Tailwind combines elevation and ring outlines into one shadow list; `none` invalidates that combined value, hiding the outlines. A transparent, zero-size shadow preserves rings without adding elevation.
- Grouped job cards originally had a solid harbour-200 outline. Moving them to the common card surface reduced its opacity to 50%. They now keep the stronger outline while responding to the studio controls.
- The company selector originally used harbour-300 borders. It now keeps that default through a control-border token, which still follows border overrides and contrast adjustments.
- Linked event footers now retain the original negative 1px overlap, scaled with border width.

## Render comparisons

Used Chromium at 1440 × 1000 with the default theme. For each sample, captured the current component and the same markup with its historical frame styles, including the surrounding outline. The comparison holds content, fonts and images constant; these are component comparisons rather than screenshots of the entire historical site.

| Sample                                | Pixel differences |
| ------------------------------------- | ----------------- |
| Event card with cover and inset panel | 0                 |
| Compact recurring event card          | 0                 |
| Company directory card                | 0                 |
| Grouped company job card              | 0                 |
| Company selector trigger              | 0                 |

Also checked that public event cards render outlines, custom elevation remains available, and Reset restores the default outlines. Existing checks cover the original palette and density values. This comparison does not establish visual equivalence for every page or interaction state.
