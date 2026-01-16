import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About - siliconharbour.dev" },
    { name: "description", content: "About siliconharbour.dev - a community tech directory for St. John's, Newfoundland" },
  ];
}

function ObfuscatedEmail() {
  // Split up the email to make it harder for scrapers
  const user = "admin";
  const domain = "siliconharbour";
  const tld = "dev";
  
  const handleClick = () => {
    window.location.href = `mai${"lt"}o:${user}@${domain}.${tld}`;
  };
  
  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-harbour-600 hover:text-harbour-700 underline decoration-harbour-300 hover:decoration-harbour-500 transition-colors"
    >
      {user} [at] {domain} [dot] {tld}
    </button>
  );
}

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-harbour-700">About siliconharbour.dev</h1>
        
        <section className="space-y-4">
          <p className="text-harbour-600 text-lg">
            siliconharbour.dev is a community directory for the tech scene in St. John's, 
            Newfoundland and Labrador.
          </p>
          
          <p className="text-harbour-600">
            Our goal is to make it easier for people to discover and connect with the local 
            technology community. Whether you're looking for tech events to attend, companies 
            to work for, meetup groups to join, or just want to learn more about what's 
            happening in the NL tech scene, this directory aims to be a helpful starting point.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-harbour-700">What's Listed</h2>
          <ul className="list-disc pl-6 text-harbour-600 space-y-2">
            <li><strong>Events</strong> - Tech meetups, conferences, workshops, and hackathons</li>
            <li><strong>Companies</strong> - Local tech companies and startups</li>
            <li><strong>Groups</strong> - Meetup groups, communities, and organizations</li>
            <li><strong>Projects</strong> - Open source and community projects</li>
            <li><strong>Learning</strong> - Courses, bootcamps, and educational resources</li>
            <li><strong>People</strong> - Community members who want to be listed</li>
            <li><strong>News</strong> - Local tech news and announcements</li>
            <li><strong>Jobs</strong> - Job postings at local tech companies</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-harbour-700">Get Involved</h2>
          <p className="text-harbour-600">
            This is a community resource. If you'd like to add a listing, suggest a correction, 
            or contribute in any way, please get in touch.
          </p>
        </section>

        <section className="space-y-4 border-t border-harbour-200 pt-6">
          <h2 className="text-xl font-semibold text-harbour-700">Contact</h2>
          <p className="text-harbour-600">
            For questions, suggestions, or to request a listing, email us at: <ObfuscatedEmail />
          </p>
        </section>
      </article>
    </div>
  );
}
