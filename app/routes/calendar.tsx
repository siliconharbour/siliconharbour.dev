import type { Route } from "./+types/calendar";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { getUpcomingEvents } from "~/lib/events.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Calendar - siliconharbour.dev" },
    { name: "description", content: "Subscribe to the St. John's tech community calendar." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const siteUrl = process.env.SITE_URL || "https://siliconharbour.dev";
  const calendarUrl = `${siteUrl}/calendar.ics`;
  const events = await getUpcomingEvents();
  return { calendarUrl, events: events.slice(0, 5) };
}

export default function CalendarPage() {
  const { calendarUrl, events } = useLoaderData<typeof loader>();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = calendarUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold text-harbour-700 mb-2">Calendar</h1>
      <p className="text-harbour-500 mb-8">
        Subscribe to the siliconharbour.dev calendar to keep track of local tech events.
      </p>

      {/* Calendar URL */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-harbour-700 mb-3">Subscribe to Calendar</h2>
        <div className="p-4 ring-1 ring-harbour-200/50">
          <div className="flex items-center gap-4">
            <code className="flex-1 text-sm text-harbour-600 truncate">{calendarUrl}</code>
            <button
              onClick={copyToClipboard}
              className="shrink-0 px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>
      </section>

      {/* What is ICS */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-harbour-700 mb-3">What is an ICS Calendar?</h2>
        <p className="text-harbour-600 mb-4">
          ICS (iCalendar) is a universal calendar format supported by all major calendar applications. 
          When you subscribe to an ICS calendar, events are automatically added to your calendar 
          and stay in sync - when we add or update events, your calendar updates too.
        </p>
      </section>

      {/* Setup Instructions */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-harbour-700 mb-4">How to Subscribe</h2>
        
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Google Calendar</h3>
            <ol className="text-harbour-600 list-decimal list-inside space-y-1">
              <li>Copy the calendar URL above</li>
              <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="link-inline link-external text-harbour-600">Google Calendar</a></li>
              <li>Click the + next to "Other calendars" in the left sidebar</li>
              <li>Select "From URL"</li>
              <li>Paste the URL and click "Add calendar"</li>
            </ol>
          </div>

          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Apple Calendar (Mac)</h3>
            <ol className="text-harbour-600 list-decimal list-inside space-y-1">
              <li>Copy the calendar URL above</li>
              <li>Open the Calendar app</li>
              <li>Go to File &rarr; New Calendar Subscription</li>
              <li>Paste the URL and click Subscribe</li>
              <li>Adjust settings and click OK</li>
            </ol>
          </div>

          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Apple Calendar (iPhone/iPad)</h3>
            <ol className="text-harbour-600 list-decimal list-inside space-y-1">
              <li>Copy the calendar URL above</li>
              <li>Go to Settings &rarr; Calendar &rarr; Accounts</li>
              <li>Tap "Add Account" &rarr; "Other"</li>
              <li>Tap "Add Subscribed Calendar"</li>
              <li>Paste the URL and tap Next</li>
            </ol>
          </div>

          <div>
            <h3 className="font-medium text-harbour-700 mb-2">Microsoft Outlook</h3>
            <ol className="text-harbour-600 list-decimal list-inside space-y-1">
              <li>Copy the calendar URL above</li>
              <li>Open Outlook and go to Calendar</li>
              <li>Click "Add calendar" &rarr; "Subscribe from web"</li>
              <li>Paste the URL and give it a name</li>
              <li>Click Import</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Upcoming Events Preview */}
      {events.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-harbour-700 mb-4">Upcoming Events</h2>
          <div className="flex flex-col gap-3">
            {events.map((event) => {
              const nextDate = event.dates[0];
              if (!nextDate) return null;
              return (
                <a
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-xs text-harbour-500 uppercase">
                        {format(nextDate.startDate, "MMM")}
                      </div>
                      <div className="text-lg font-semibold text-harbour-700">
                        {format(nextDate.startDate, "d")}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-medium text-harbour-700">{event.title}</h3>
                      <p className="text-sm text-harbour-500">
                        {format(nextDate.startDate, "EEEE 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
          <a href="/events" className="link-inline block mt-4 text-sm text-harbour-600">
            View all events &rarr;
          </a>
        </section>
      )}
    </div>
  );
}
