import { useTheme } from "~/theme/provider";
import type { Route } from "./+types/design";
import { useState, type ReactNode } from "react";
import { useLoaderData } from "react-router";
import { Alert, Badge, Button } from "~/components/ui";
import { getUpcomingEvents } from "~/lib/events.server";
import { getPublishedNews } from "~/lib/news.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Design System - siliconharbour.dev" }];
}

export async function loader({}: Route.LoaderArgs) {
  const [events, news] = await Promise.all([getUpcomingEvents(), getPublishedNews()]);
  return {
    eventPreviews: events.map(({ slug, title }) => ({ slug, title })),
    newsPreviews: news.map(({ slug, title }) => ({ slug, title })),
    previewToken: Date.now(),
  };
}

export default function DesignSystem() {
  const { theme } = useTheme();
  const { eventPreviews, newsPreviews, previewToken } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Design System</h1>
          <p className="text-subtle mt-1">
            Visual elements and patterns used throughout siliconharbour.dev
          </p>
        </div>

        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Live theme tokens</h2>
          <p className="text-muted">
            Open the 🎨 button in the bottom-left corner to experiment. Your preview stays active
            as you browse; copy a share link to show it to someone else.
          </p>
          <div className="grid sm:grid-cols-3 gap-gap-4">
            <div className="p-pad-4 border border-line bg-surface rounded-panel">
              <h3 className="font-semibold text-heading">Card surface</h3>
              <p className="text-body">Body text and responsive padding.</p>
              <p className="text-sm text-muted">Secondary text</p>
            </div>
            <div className="p-pad-4 bg-soft border border-line rounded-panel">
              <h3 className="text-heading font-semibold">Muted surface</h3>
              <p className="text-sm text-body">Derived from the brand palette.</p>
            </div>
            <div className="flex flex-col gap-gap-3">
              <Button>Primary action</Button>
              <label className="text-sm text-body">
                Example input
                <input
                  className="w-full border border-line bg-surface px-pad-3 py-pad-2"
                  placeholder="Try control corners"
                />
              </label>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-gap-3 text-sm text-body">
            <div>
              <dt className="text-muted">Body / heading fonts</dt>
              <dd>
                {theme.bodyFont} / {theme.headingFont}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Type / line height</dt>
              <dd>
                {theme.typeScale}× / {theme.lineHeight}×
              </dd>
            </div>
            <div>
              <dt className="text-muted">Padding / gaps</dt>
              <dd>
                {theme.padding}× / {theme.gaps}×
              </dd>
            </div>
            <div>
              <dt className="text-muted">Control / card corners</dt>
              <dd>
                {theme.controlRadius}px / {theme.panelRadius}px
              </dd>
            </div>
          </dl>
        </section>

        {/* Color Palette */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Color Palette</h2>
          <p className="text-sm text-muted">
            The harbour-* OKLCH ramp follows the studio’s main colour. Use 600 for primary actions,
            700 for headings.
          </p>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-gap-2">
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => (
              <div key={shade} className="flex flex-col gap-gap-1">
                <div
                  className={`h-12 bg-harbour-${shade}`}
                  style={{ backgroundColor: `var(--theme-harbour-${shade})` }}
                />
                <span className="text-xs text-muted text-center">{shade}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-gap-2 text-sm">
            <div className="p-pad-2 bg-red-100 text-red-700">Red - Errors/Danger</div>
            <div className="p-pad-2 bg-amber-100 text-amber-700">Amber - Warnings/Hidden</div>
            <div className="p-pad-2 bg-green-100 text-green-700">Green - Success</div>
            <div className="p-pad-2 bg-purple-100 text-purple-700">Purple - Remote work</div>
          </div>
        </section>

        {/* Event timing */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Event timing</h2>
          <p className="text-sm text-muted">
            Scheduled events happen at a set time. Time periods run across a date range, like a game
            jam or application window.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="border border-green-200 bg-surface p-pad-4 flex flex-col gap-gap-2 rounded-panel">
              <div className="flex flex-wrap gap-gap-2">
                <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-50 text-green-700">
                  Happening now
                </span>
                <span className="text-xs px-pad-1-5 py-pad-0-5 bg-red-100 text-red-700">
                  Game jam
                </span>
              </div>
              <h3 className="font-medium text-heading">GUMP Jam 3: Computer Lab</h3>
              <p className="text-sm text-body">September 12 - September 26, 2026</p>
              <p className="text-sm text-subtle">Online</p>
            </div>
            <div className="border border-line bg-surface p-pad-4 flex flex-col gap-gap-2 rounded-panel">
              <span className="self-start text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
                Earlier today
              </span>
              <h3 className="font-medium text-heading">Community Demo Night</h3>
              <p className="text-sm text-body">Saturday, August 29 at 2:00 PM</p>
              <p className="text-sm text-subtle">
                Events stay listed until midnight in Newfoundland.
              </p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Typography</h2>
          <div className="flex flex-col gap-gap-3 p-pad-4 border border-line bg-surface rounded-panel">
            <p className="text-2xl font-semibold text-heading">
              Page Title (text-2xl font-semibold text-heading)
            </p>
            <p className="text-lg font-semibold text-heading">
              Section Heading (text-lg font-semibold text-heading)
            </p>
            <p className="font-medium text-heading">Card Title (font-medium text-heading)</p>
            <p className="text-body">Body text (text-body)</p>
            <p className="text-muted">Secondary text (text-muted)</p>
            <p className="text-subtle">Muted text (text-subtle)</p>
            <p className="text-sm text-subtle">Small muted text (text-sm text-subtle)</p>
            <p className="text-xs text-muted">Extra small text (text-xs text-muted)</p>
          </div>
        </section>

        {/* Buttons */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Buttons</h2>
          <p className="text-sm text-muted">
            No rounded corners. Button variants own both their foreground and background colors for
            normal and hover states; every pairing must meet WCAG AA contrast for normal text.
          </p>
          <div className="flex flex-wrap gap-gap-3 p-pad-4 border border-line bg-surface rounded-panel">
            <Button>Primary</Button>
            <Button tone="secondary">Secondary</Button>
            <Button tone="danger">Danger</Button>
            <Button tone="warning">Warning</Button>
            <Button tone="success">Success</Button>
          </div>
          <div className="flex flex-wrap gap-gap-3 p-pad-4 border border-line bg-surface rounded-panel">
            <Button size="sm">Small Primary</Button>
            <Button size="sm" tone="secondary">
              Small Secondary
            </Button>
            <Button size="sm" tone="ghost">
              Ghost Button
            </Button>
          </div>
          <div className="p-pad-4 border border-line bg-surface rounded-panel">
            <p className="text-sm text-muted mb-2">Button with count badge:</p>
            <button className="px-pad-4 py-pad-2 bg-amber-700 hover:bg-amber-800 text-white hover:text-white font-medium transition-colors flex items-center gap-gap-2">
              Review
              <span className="px-pad-1-5 py-pad-0-5 bg-amber-800 text-xs">12</span>
            </button>
          </div>
        </section>

        {/* Form Inputs */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Form Inputs</h2>
          <p className="text-sm text-muted">
            No rounded corners. Use focus:ring-2 focus:ring-harbour-500 for focus states.
          </p>
          <div className="flex flex-col gap-gap-4 p-pad-4 border border-line bg-surface rounded-panel">
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Text Input</label>
              <input
                type="text"
                placeholder="Placeholder text"
                className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Select</label>
              <select className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500">
                <option>Option 1</option>
                <option>Option 2</option>
                <option>Option 3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Textarea</label>
              <textarea
                placeholder="Enter text..."
                rows={3}
                className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-gap-2">
              <input type="checkbox" id="checkbox-demo" className="w-4 h-4 accent-harbour-600" />
              <label htmlFor="checkbox-demo" className="text-sm text-body">
                Checkbox option
              </label>
            </div>
          </div>
        </section>

        {/* Base UI */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Base UI Components</h2>
          <div className="p-pad-4 border border-line bg-surface flex flex-col gap-gap-2 rounded-panel">
            <p className="text-sm text-body">
              This project now uses <code>@base-ui/react</code> for advanced interactive controls
              (for example, multi-select provenance mapping).
            </p>
            <p className="text-sm text-muted">
              Keep Base UI primitives unstyled and apply the harbour design language in our own
              classes: square edges, no shadows, harbour palette, and semantic badges.
            </p>
          </div>
        </section>

        {/* Cards & Containers */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Cards & Containers</h2>
          <p className="text-sm text-muted">
            Use border border-line for containers. No shadows, no rounded corners.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="p-pad-4 border border-line bg-surface rounded-panel">
              <h3 className="font-medium text-heading">Standard Card</h3>
              <p className="text-sm text-muted mt-1">border border-line bg-surface</p>
            </div>
            <div className="p-pad-4 border border-line bg-surface hover:border-harbour-400 transition-colors cursor-pointer rounded-panel">
              <h3 className="font-medium text-heading">Clickable Card</h3>
              <p className="text-sm text-muted mt-1">hover:border-harbour-400</p>
            </div>
            <div className="p-pad-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all cursor-pointer">
              <h3 className="font-medium text-heading">Ring Card (Directory style)</h3>
              <p className="text-sm text-muted mt-1">ring-1 ring-harbour-200/50</p>
            </div>
            <div className="p-pad-4 border border-line bg-soft">
              <h3 className="font-medium text-heading">Muted Background</h3>
              <p className="text-sm text-muted mt-1">bg-soft</p>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Badges & Pills</h2>
          <p className="text-sm text-muted">
            Status badges use no rounded corners. Only count badges use rounded-full.
          </p>
          <div className="flex flex-wrap gap-gap-3 p-pad-4 border border-line bg-surface rounded-panel">
            <Badge>Default</Badge>
            <Badge tone="success">Active</Badge>
            <Badge tone="warning">Hidden</Badge>
            <Badge tone="danger">Error</Badge>
            <Badge tone="muted">Removed</Badge>
            <Badge tone="remote">Remote</Badge>
            <span className="text-xs px-pad-1-5 py-pad-0-5 bg-orange-100 text-orange-700">
              Hybrid
            </span>
            <span className="text-xs px-pad-1-5 py-pad-0-5 bg-blue-100 text-blue-700">On-site</span>
          </div>
        </section>

        {/* Alerts */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Alerts & Banners</h2>
          <div className="flex flex-col gap-gap-3">
            <Alert tone="danger" title="Error alert">
              Something went wrong. Please try again.
            </Alert>
            <Alert tone="warning" title="Warning alert">
              This item is hidden from public view.
            </Alert>
            <Alert tone="success" title="Success alert">
              Changes saved successfully.
            </Alert>
            <Alert title="Info alert">Helpful information for the user.</Alert>
          </div>
        </section>

        {/* List Items */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">List Items</h2>
          <p className="text-sm text-muted">
            Admin lists use stacked cards instead of traditional tables.
          </p>
          <div className="flex flex-col gap-gap-2">
            <div className="flex items-center gap-gap-4 p-pad-4 border border-line bg-surface rounded-panel">
              <div className="w-12 h-12 bg-tint flex items-center justify-center flex-shrink-0">
                <span className="text-lg text-subtle">A</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-heading truncate">List Item Title</p>
                <p className="text-sm text-subtle">Secondary information</p>
              </div>
              <div className="flex items-center gap-gap-2">
                <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">Badge</span>
                <button className="px-pad-3 py-pad-1-5 text-sm bg-tint text-heading hover:bg-harbour-200 transition-colors">
                  Edit
                </button>
              </div>
            </div>
            <div className="flex items-center gap-gap-4 p-pad-4 border border-amber-200 bg-amber-50">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-lg text-amber-600">H</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-heading truncate">Hidden Item</p>
                <p className="text-sm text-subtle">This item is hidden</p>
              </div>
              <div className="flex items-center gap-gap-2">
                <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-200 text-amber-700">
                  Hidden
                </span>
                <button className="px-pad-3 py-pad-1-5 text-sm bg-tint text-heading hover:bg-harbour-200 transition-colors">
                  Edit
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Tables (when needed) */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Tables</h2>
          <p className="text-sm text-muted">
            When tables are needed, use border-collapse with harbour borders.
          </p>
          <div className="border border-line bg-surface overflow-hidden rounded-panel">
            <table className="w-full">
              <thead className="bg-soft border-b border-line">
                <tr>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Column 1
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Column 2
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Column 3
                  </th>
                  <th className="px-pad-4 py-pad-3 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                <tr className="hover:bg-soft">
                  <td className="px-pad-4 py-pad-3 text-heading">Row 1, Col 1</td>
                  <td className="px-pad-4 py-pad-3 text-sm text-muted">Row 1, Col 2</td>
                  <td className="px-pad-4 py-pad-3 text-sm text-muted">Row 1, Col 3</td>
                  <td className="px-pad-4 py-pad-3 text-right">
                    <button className="px-pad-2 py-pad-1 text-xs bg-tint text-heading hover:bg-harbour-200 transition-colors">
                      Action
                    </button>
                  </td>
                </tr>
                <tr className="hover:bg-soft">
                  <td className="px-pad-4 py-pad-3 text-heading">Row 2, Col 1</td>
                  <td className="px-pad-4 py-pad-3 text-sm text-muted">Row 2, Col 2</td>
                  <td className="px-pad-4 py-pad-3 text-sm text-muted">Row 2, Col 3</td>
                  <td className="px-pad-4 py-pad-3 text-right">
                    <button className="px-pad-2 py-pad-1 text-xs bg-tint text-heading hover:bg-harbour-200 transition-colors">
                      Action
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Stats */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Stats & Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-gap-4">
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-body">42</div>
              <div className="text-sm text-muted">Total Items</div>
            </div>
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-green-600">26</div>
              <div className="text-sm text-muted">Active</div>
            </div>
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-amber-500">8</div>
              <div className="text-sm text-muted">Hidden</div>
            </div>
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-slate-400">8</div>
              <div className="text-sm text-muted">Removed</div>
            </div>
          </div>
        </section>

        {/* Operational patterns */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Operational Patterns</h2>
          <p className="text-sm text-muted">
            Admin states should be immediately scannable: green means the queue is clear, amber
            means attention is needed, and destructive actions remain visually separate.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="border border-green-200 bg-green-50 p-pad-4 flex items-center justify-between gap-gap-4">
              <div>
                <p className="font-medium text-green-700">Everything is reviewed</p>
                <p className="text-sm text-green-700/80">No events, news, or jobs are waiting.</p>
              </div>
              <Badge tone="success">0 pending</Badge>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-pad-4 flex items-center justify-between gap-gap-4">
              <div>
                <p className="font-medium text-amber-800">Review needed</p>
                <p className="text-sm text-amber-700">Items need an operator decision.</p>
              </div>
              <Badge tone="warning">8 pending</Badge>
            </div>
          </div>
          <div className="border border-line bg-surface p-pad-6 text-center rounded-panel">
            <p className="font-medium text-heading">Nothing here yet</p>
            <p className="text-sm text-subtle mt-1">
              Empty states should explain whether the user is done or needs to take an action.
            </p>
            <Button size="sm" className="mt-4">
              Create an item
            </Button>
          </div>
        </section>

        {/* Social preview images */}
        <section className="flex flex-col gap-gap-4">
          <h2 className="text-lg font-semibold text-heading">Social Preview Images</h2>
          <p className="text-sm text-muted">
            OG images are always 1200 × 630. These are live renderers using current data, shown at
            their real aspect ratio so cropping and long-title problems are visible here first.
          </p>
          <div className="flex flex-col gap-gap-6">
            <SocialPreview label="Site default" src={`/og.png?preview=${previewToken}`} />
            {eventPreviews.length > 0 ? (
              <SocialPreviewCarousel
                label="Upcoming event"
                items={eventPreviews.map((item) => ({
                  title: item.title,
                  src: `/events/${item.slug}.png?preview=${previewToken}`,
                }))}
              />
            ) : (
              <Alert>No upcoming public event is available for an event preview.</Alert>
            )}
            {newsPreviews.length > 0 ? (
              <SocialPreviewCarousel
                label="Published news"
                items={newsPreviews.map((item) => ({
                  title: item.title,
                  src: `/news/${item.slug}.png?preview=${previewToken}`,
                }))}
              />
            ) : (
              <Alert>No published news item is available for a news preview.</Alert>
            )}
          </div>
        </section>

        {/* Key Principles */}
        <section className="flex flex-col gap-gap-4 p-pad-4 border border-line bg-soft">
          <h2 className="text-lg font-semibold text-heading">Key Principles</h2>
          <ul className="flex flex-col gap-gap-2 text-sm text-body">
            <li>
              <strong>Square by default</strong> - Control and card radius tokens default to zero
            </li>
            <li>
              <strong>Borders over shadows</strong> - Use border or ring-1 instead of shadow-*
            </li>
            <li>
              <strong>Subtle interactions</strong> - Hover states change border/color, not transform
            </li>
            <li>
              <strong>Consistent spacing</strong> - Use Tailwind's scale: gap-gap-2, gap-gap-3,
              gap-gap-4, gap-gap-6
            </li>
            <li>
              <strong>harbour-* palette</strong> - Blue-focused, 600 for primary, 700 for headings
            </li>
            <li>
              <strong>White backgrounds</strong> - Cards use bg-surface, muted areas use bg-soft
            </li>
            <li>
              <strong>Semantic colors</strong> - Amber for warnings, Red for errors, Green for
              success
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function SocialPreviewCarousel({
  label,
  items,
}: {
  label: string;
  items: Array<{ title: string; src: string }>;
}) {
  const [index, setIndex] = useState(0);
  const current = items[index];
  const move = (offset: number) =>
    setIndex((value) => (value + offset + items.length) % items.length);

  return (
    <SocialPreview
      label={label}
      title={current.title}
      src={current.src}
      controls={
        <div className="flex items-center gap-gap-2">
          <span className="text-xs tabular-nums text-subtle">
            {index + 1} / {items.length}
          </span>
          <Button
            type="button"
            tone="secondary"
            size="sm"
            onClick={() => move(-1)}
            disabled={items.length < 2}
            aria-label={`Previous ${label.toLowerCase()} preview`}
          >
            &larr;
          </Button>
          <Button
            type="button"
            tone="secondary"
            size="sm"
            onClick={() => move(1)}
            disabled={items.length < 2}
            aria-label={`Next ${label.toLowerCase()} preview`}
          >
            &rarr;
          </Button>
        </div>
      }
    />
  );
}

function SocialPreview({
  label,
  title,
  src,
  controls,
}: {
  label: string;
  title?: string;
  src: string;
  controls?: ReactNode;
}) {
  return (
    <figure className="border border-line bg-surface">
      <div className="px-pad-4 py-pad-3 border-b border-line flex flex-wrap items-center justify-between gap-gap-4">
        <figcaption className="min-w-0">
          <span className="font-medium text-heading">{label}</span>
          {title ? <span className="block text-sm text-subtle truncate">{title}</span> : null}
        </figcaption>
        <div className="flex items-center gap-gap-3">
          {controls}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-body hover:text-heading whitespace-nowrap"
          >
            Open full size
          </a>
        </div>
      </div>
      <div className="bg-soft p-pad-3">
        <img
          src={src}
          alt={`${label} Open Graph preview`}
          loading="lazy"
          className="block w-full aspect-[1200/630] object-contain bg-surface border border-harbour-100"
        />
      </div>
    </figure>
  );
}
