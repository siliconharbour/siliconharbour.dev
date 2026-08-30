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
  const { eventPreviews, newsPreviews, previewToken } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-harbour-700">Design System</h1>
          <p className="text-harbour-400 mt-1">
            Visual elements and patterns used throughout siliconharbour.dev
          </p>
        </div>

        {/* Color Palette */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Color Palette</h2>
          <p className="text-sm text-harbour-500">
            The harbour-* palette ranges from light blue to dark navy. Use 600 for primary actions,
            700 for headings.
          </p>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => (
              <div key={shade} className="flex flex-col gap-1">
                <div
                  className={`h-12 bg-harbour-${shade}`}
                  style={{ backgroundColor: `var(--color-harbour-${shade})` }}
                />
                <span className="text-xs text-harbour-500 text-center">{shade}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="p-2 bg-red-100 text-red-700">Red - Errors/Danger</div>
            <div className="p-2 bg-amber-100 text-amber-700">Amber - Warnings/Hidden</div>
            <div className="p-2 bg-green-100 text-green-700">Green - Success</div>
            <div className="p-2 bg-purple-100 text-purple-700">Purple - Remote work</div>
          </div>
        </section>

        {/* Event timing */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Event timing</h2>
          <p className="text-sm text-harbour-500">
            Scheduled events happen at a set time. Time periods run across a date range, like a game
            jam or application window.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-green-200 bg-white p-4 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700">
                  Happening now
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700">Game jam</span>
              </div>
              <h3 className="font-medium text-harbour-700">GUMP Jam 3: Computer Lab</h3>
              <p className="text-sm text-harbour-600">September 12 - September 26, 2026</p>
              <p className="text-sm text-harbour-400">Online</p>
            </div>
            <div className="border border-harbour-200 bg-white p-4 flex flex-col gap-2">
              <span className="self-start text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
                Earlier today
              </span>
              <h3 className="font-medium text-harbour-700">Community Demo Night</h3>
              <p className="text-sm text-harbour-600">Saturday, August 29 at 2:00 PM</p>
              <p className="text-sm text-harbour-400">
                Events stay listed until midnight in Newfoundland.
              </p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Typography</h2>
          <div className="flex flex-col gap-3 p-4 border border-harbour-200 bg-white">
            <p className="text-2xl font-semibold text-harbour-700">
              Page Title (text-2xl font-semibold text-harbour-700)
            </p>
            <p className="text-lg font-semibold text-harbour-700">
              Section Heading (text-lg font-semibold text-harbour-700)
            </p>
            <p className="font-medium text-harbour-700">
              Card Title (font-medium text-harbour-700)
            </p>
            <p className="text-harbour-600">Body text (text-harbour-600)</p>
            <p className="text-harbour-500">Secondary text (text-harbour-500)</p>
            <p className="text-harbour-400">Muted text (text-harbour-400)</p>
            <p className="text-sm text-harbour-400">Small muted text (text-sm text-harbour-400)</p>
            <p className="text-xs text-harbour-500">Extra small text (text-xs text-harbour-500)</p>
          </div>
        </section>

        {/* Buttons */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Buttons</h2>
          <p className="text-sm text-harbour-500">
            No rounded corners. Button variants own both their foreground and background colors for
            normal and hover states; every pairing must meet WCAG AA contrast for normal text.
          </p>
          <div className="flex flex-wrap gap-3 p-4 border border-harbour-200 bg-white">
            <Button>Primary</Button>
            <Button tone="secondary">Secondary</Button>
            <Button tone="danger">Danger</Button>
            <Button tone="warning">Warning</Button>
            <Button tone="success">Success</Button>
          </div>
          <div className="flex flex-wrap gap-3 p-4 border border-harbour-200 bg-white">
            <Button size="sm">Small Primary</Button>
            <Button size="sm" tone="secondary">
              Small Secondary
            </Button>
            <Button size="sm" tone="ghost">
              Ghost Button
            </Button>
          </div>
          <div className="p-4 border border-harbour-200 bg-white">
            <p className="text-sm text-harbour-500 mb-2">Button with count badge:</p>
            <button className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white hover:text-white font-medium transition-colors flex items-center gap-2">
              Review
              <span className="px-1.5 py-0.5 bg-amber-800 text-xs">12</span>
            </button>
          </div>
        </section>

        {/* Form Inputs */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Form Inputs</h2>
          <p className="text-sm text-harbour-500">
            No rounded corners. Use focus:ring-2 focus:ring-harbour-500 for focus states.
          </p>
          <div className="flex flex-col gap-4 p-4 border border-harbour-200 bg-white">
            <div>
              <label className="block text-sm font-medium text-harbour-700 mb-1">Text Input</label>
              <input
                type="text"
                placeholder="Placeholder text"
                className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-harbour-700 mb-1">Select</label>
              <select className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500">
                <option>Option 1</option>
                <option>Option 2</option>
                <option>Option 3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-harbour-700 mb-1">Textarea</label>
              <textarea
                placeholder="Enter text..."
                rows={3}
                className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="checkbox-demo" className="w-4 h-4 accent-harbour-600" />
              <label htmlFor="checkbox-demo" className="text-sm text-harbour-600">
                Checkbox option
              </label>
            </div>
          </div>
        </section>

        {/* Base UI */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Base UI Components</h2>
          <div className="p-4 border border-harbour-200 bg-white flex flex-col gap-2">
            <p className="text-sm text-harbour-600">
              This project now uses <code>@base-ui/react</code> for advanced interactive controls
              (for example, multi-select provenance mapping).
            </p>
            <p className="text-sm text-harbour-500">
              Keep Base UI primitives unstyled and apply the harbour design language in our own
              classes: square edges, no shadows, harbour palette, and semantic badges.
            </p>
          </div>
        </section>

        {/* Cards & Containers */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Cards & Containers</h2>
          <p className="text-sm text-harbour-500">
            Use border border-harbour-200 for containers. No shadows, no rounded corners.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-harbour-200 bg-white">
              <h3 className="font-medium text-harbour-700">Standard Card</h3>
              <p className="text-sm text-harbour-500 mt-1">border border-harbour-200 bg-white</p>
            </div>
            <div className="p-4 border border-harbour-200 bg-white hover:border-harbour-400 transition-colors cursor-pointer">
              <h3 className="font-medium text-harbour-700">Clickable Card</h3>
              <p className="text-sm text-harbour-500 mt-1">hover:border-harbour-400</p>
            </div>
            <div className="p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all cursor-pointer">
              <h3 className="font-medium text-harbour-700">Ring Card (Directory style)</h3>
              <p className="text-sm text-harbour-500 mt-1">ring-1 ring-harbour-200/50</p>
            </div>
            <div className="p-4 border border-harbour-200 bg-harbour-50">
              <h3 className="font-medium text-harbour-700">Muted Background</h3>
              <p className="text-sm text-harbour-500 mt-1">bg-harbour-50</p>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Badges & Pills</h2>
          <p className="text-sm text-harbour-500">
            Status badges use no rounded corners. Only count badges use rounded-full.
          </p>
          <div className="flex flex-wrap gap-3 p-4 border border-harbour-200 bg-white">
            <Badge>Default</Badge>
            <Badge tone="success">Active</Badge>
            <Badge tone="warning">Hidden</Badge>
            <Badge tone="danger">Error</Badge>
            <Badge tone="muted">Removed</Badge>
            <Badge tone="remote">Remote</Badge>
            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700">Hybrid</span>
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700">On-site</span>
          </div>
        </section>

        {/* Alerts */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Alerts & Banners</h2>
          <div className="flex flex-col gap-3">
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
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">List Items</h2>
          <p className="text-sm text-harbour-500">
            Admin lists use stacked cards instead of traditional tables.
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 p-4 border border-harbour-200 bg-white">
              <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center flex-shrink-0">
                <span className="text-lg text-harbour-400">A</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-harbour-700 truncate">List Item Title</p>
                <p className="text-sm text-harbour-400">Secondary information</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">Badge</span>
                <button className="px-3 py-1.5 text-sm bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors">
                  Edit
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 border border-amber-200 bg-amber-50">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-lg text-amber-600">H</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-harbour-700 truncate">Hidden Item</p>
                <p className="text-sm text-harbour-400">This item is hidden</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-700">Hidden</span>
                <button className="px-3 py-1.5 text-sm bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors">
                  Edit
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Tables (when needed) */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Tables</h2>
          <p className="text-sm text-harbour-500">
            When tables are needed, use border-collapse with harbour borders.
          </p>
          <div className="border border-harbour-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead className="bg-harbour-50 border-b border-harbour-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Column 1
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Column 2
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Column 3
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-harbour-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                <tr className="hover:bg-harbour-50">
                  <td className="px-4 py-3 text-harbour-700">Row 1, Col 1</td>
                  <td className="px-4 py-3 text-sm text-harbour-500">Row 1, Col 2</td>
                  <td className="px-4 py-3 text-sm text-harbour-500">Row 1, Col 3</td>
                  <td className="px-4 py-3 text-right">
                    <button className="px-2 py-1 text-xs bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors">
                      Action
                    </button>
                  </td>
                </tr>
                <tr className="hover:bg-harbour-50">
                  <td className="px-4 py-3 text-harbour-700">Row 2, Col 1</td>
                  <td className="px-4 py-3 text-sm text-harbour-500">Row 2, Col 2</td>
                  <td className="px-4 py-3 text-sm text-harbour-500">Row 2, Col 3</td>
                  <td className="px-4 py-3 text-right">
                    <button className="px-2 py-1 text-xs bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors">
                      Action
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Stats */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Stats & Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-harbour-600">42</div>
              <div className="text-sm text-harbour-500">Total Items</div>
            </div>
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-green-600">26</div>
              <div className="text-sm text-harbour-500">Active</div>
            </div>
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-amber-500">8</div>
              <div className="text-sm text-harbour-500">Hidden</div>
            </div>
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-slate-400">8</div>
              <div className="text-sm text-harbour-500">Removed</div>
            </div>
          </div>
        </section>

        {/* Operational patterns */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Operational Patterns</h2>
          <p className="text-sm text-harbour-500">
            Admin states should be immediately scannable: green means the queue is clear, amber
            means attention is needed, and destructive actions remain visually separate.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-green-700">Everything is reviewed</p>
                <p className="text-sm text-green-700/80">No events, news, or jobs are waiting.</p>
              </div>
              <Badge tone="success">0 pending</Badge>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-amber-800">Review needed</p>
                <p className="text-sm text-amber-700">Items need an operator decision.</p>
              </div>
              <Badge tone="warning">8 pending</Badge>
            </div>
          </div>
          <div className="border border-harbour-200 bg-white p-6 text-center">
            <p className="font-medium text-harbour-700">Nothing here yet</p>
            <p className="text-sm text-harbour-400 mt-1">
              Empty states should explain whether the user is done or needs to take an action.
            </p>
            <Button size="sm" className="mt-4">
              Create an item
            </Button>
          </div>
        </section>

        {/* Social preview images */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-harbour-700">Social Preview Images</h2>
          <p className="text-sm text-harbour-500">
            OG images are always 1200 × 630. These are live renderers using current data, shown at
            their real aspect ratio so cropping and long-title problems are visible here first.
          </p>
          <div className="flex flex-col gap-6">
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
        <section className="flex flex-col gap-4 p-4 border border-harbour-200 bg-harbour-50">
          <h2 className="text-lg font-semibold text-harbour-700">Key Principles</h2>
          <ul className="flex flex-col gap-2 text-sm text-harbour-600">
            <li>
              <strong>No rounded corners</strong> - Everything uses sharp, square edges
            </li>
            <li>
              <strong>Borders over shadows</strong> - Use border or ring-1 instead of shadow-*
            </li>
            <li>
              <strong>Subtle interactions</strong> - Hover states change border/color, not transform
            </li>
            <li>
              <strong>Consistent spacing</strong> - Use Tailwind's scale: gap-2, gap-3, gap-4, gap-6
            </li>
            <li>
              <strong>harbour-* palette</strong> - Blue-focused, 600 for primary, 700 for headings
            </li>
            <li>
              <strong>White backgrounds</strong> - Cards use bg-white, muted areas use bg-harbour-50
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
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-harbour-400">
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
    <figure className="border border-harbour-200 bg-white">
      <div className="px-4 py-3 border-b border-harbour-200 flex flex-wrap items-center justify-between gap-4">
        <figcaption className="min-w-0">
          <span className="font-medium text-harbour-700">{label}</span>
          {title ? <span className="block text-sm text-harbour-400 truncate">{title}</span> : null}
        </figcaption>
        <div className="flex items-center gap-3">
          {controls}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-harbour-600 hover:text-harbour-700 whitespace-nowrap"
          >
            Open full size
          </a>
        </div>
      </div>
      <div className="bg-harbour-50 p-3">
        <img
          src={src}
          alt={`${label} Open Graph preview`}
          loading="lazy"
          className="block w-full aspect-[1200/630] object-contain bg-white border border-harbour-100"
        />
      </div>
    </figure>
  );
}
