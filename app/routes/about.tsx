import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About - siliconharbour.dev" },
    {
      name: "description",
      content:
        "About siliconharbour.dev - a community tech directory for St. John's, Newfoundland & Labrador",
    },
  ];
}

function ObfuscatedEmail() {
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
    <div className="max-w-3xl mx-auto p-4 py-8">
      <article className="prose">
        <h1>About siliconharbour.dev</h1>

        <p className="text-lg">
          siliconharbour.dev is a community directory for the tech scene in St.
          John's, Newfoundland and Labrador.
        </p>

        <p>
          Our goal is to make it easier for people to discover and connect with
          the local technology community. Whether you're looking for events to
          attend, companies to work for, meetup groups to join, or just want to
          learn more about what's happening, this site aims to be a helpful
          resource.
        </p>

        <h2>Get Involved</h2>

        <p>
          If you'd like to add an event, suggest a correction, or contribute in
          any way, please get in touch with the site's creator,{" "}
          <a href="https://jackharrhy.dev/">Jack Harrhy</a>.
        </p>

        <h2>Contact</h2>

        <p>
          For questions, suggestions, or to request / remove a listing, email us
          at: <ObfuscatedEmail />
        </p>

        <hr />

        <h2>Frequently Asked Questions</h2>

        <h3>Who is this for?</h3>
        <p>
          This site is primarily for <strong>developers and builders</strong> -
          people who write code, ship products, and make things. Software
          engineers, web developers, data scientists, DevOps folks, designers
          who code, and anyone else who spends their days solving technical
          problems.
        </p>
        <p>
          It's less focused on the startup/founder ecosystem, enterprise
          companies, or students just getting started. Those folks are welcome
          here, but the focus is more on building software than pitching to
          investors or learning the basics.
        </p>

        <h3>Why does this exist?</h3>
        <p>
          There's a lot happening in the Newfoundland & Labrador tech scene, but
          it can be hard to 'be in the know'.
        </p>
        <p>
          Events are scattered across Meetup, LinkedIn, Discord, etc. New people
          moving to the area, or even people who have been here for a while but
          aren't as 'online', have no easy way to discover what's on the go.
        </p>
        <p>
          This site aims to be that central hub - a single place to discover
          events, companies, groups, and people in our local tech community.
        </p>

        <h3>Who built this?</h3>
        <p>
          This site was created by{" "}
          <a href="https://jackharrhy.dev/">Jack Harrhy</a>, a software
          developer based in St. John's.
        </p>
        <p>
          While I'm the creator of this site, the goal isn't for me to be the
          forever{" "}
          <a href="https://en.wikipedia.org/wiki/Benevolent_dictator_for_life">
            BDFL
          </a>{" "}
          , but I do think I'm well suited to launch it!
        </p>

        <h3>Will this always be kept up to date?</h3>
        <p>
          That's the goal! The site is designed to be low-maintenance, its
          actually built as a full web application rather than just a collection
          of markdown files / a Wordpress site.
        </p>
        <p>
          There's a bit of a bus factor on the site as it currently stands, but
          if it can function more like Wikipedia eventually, with some level of
          moderation / trusted admins, that should be less of an issue.
        </p>

        <h3>How can I add my company/event/group?</h3>
        <p>
          Email us at <ObfuscatedEmail /> with the details you'd like listed.
          Include as much information as possible: name, description, website,
          logo, and any relevant links.
        </p>
        <p>
          We do reserve the right so say, <i>no</i>, as the intent is for the
          content be of high quality, see if you can maybe find some PMF before
          submitting your B2B SaaS ChatGPT wrapper.
        </p>

        <h3>How can I remove my listing?</h3>
        <p>
          Email us at <ObfuscatedEmail /> and we'll remove it promptly. No
          questions asked - we respect your privacy and preferences.
        </p>

        <h3>
          Is this affiliated with TechNL, Genesis, or any other organization?
        </h3>
        <p>
          No, this is an independent community project. While we reference
          companies and such from directories like TechNL and Genesis Centre
          (with appropriate attribution), we're not officially affiliated with
          any organization.
        </p>

        <h3>Is the site open source?</h3>
        <p>
          Yes! The source code is available on{" "}
          <a href="https://github.com/siliconharbour/siliconharbour.dev">
            GitHub
          </a>
          . Contributions, bug reports, and feature suggestions are welcome.
        </p>

        <h3>How is this funded?</h3>
        <p>
          Currently, this is a personal project with minimal hosting costs.
          There are no ads, sponsorships, or paid listings.
        </p>
        <p>
          I think opening this up to having a <i>light</i> sponsorship system
          for curated relevant ads on the website, and inclusions in
          newsletters, is in the future of this website
        </p>
        <p>
          If you're part of a company that would be interested in this sort of
          thing in the future, reach out!
        </p>

        <h3>Is this site vibe-coded?</h3>
        <p>
          By the{" "}
          <a href="https://x.com/karpathy/status/1886192184808149383?lang=en">
            Andrej Karpathy
          </a>{" "}
          definition, <i>I don't think so</i>, but since its mostly just a CRUD
          application, and I didn't want to spend a ton of time on it, or a ton
          of time maintaining it, OpenCode and Claude Opus 4.5 were indeed the
          tools that authored this site, in the hands of someone who could have
          built it without those tools, but its 2026 and CRUD is solved.
        </p>
        <p>
          The goal is for any textual copy / information / etc. on this website
          to however not at all AI generated, this is the part I hope will take
          the longest amount of time, curating content, ensuring quality and
          quantity!
        </p>
      </article>
    </div>
  );
}
