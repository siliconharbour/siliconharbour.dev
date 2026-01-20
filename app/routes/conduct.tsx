import type { Route } from "./+types/conduct";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Community Guidelines - siliconharbour.dev" },
    {
      name: "description",
      content: "Community guidelines for participating on siliconharbour.dev",
    },
  ];
}

export default function ConductPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 py-8">
      <article className="prose">
        <h1>Community Guidelines</h1>

        <p className="text-lg">
          siliconharbour.dev is a community resource for folks interested in
          tech and software in Newfoundland & Labrador. We want everyone to feel
          welcome and able to participate constructively.
        </p>

        <h2>The Short Version</h2>

        <p>
          Don't be a jerk. Treat people with respect. If you wouldn't say it to
          someone's face at a meetup, don't say it here.
        </p>

        <p>
          Comments that violate these guidelines will be removed, and repeat
          offenders may be blocked from participating.
        </p>

        <h2>Guidelines for Comments</h2>

        <ul>
          <li>
            <strong>Be respectful.</strong> Disagreement is fine; personal
            attacks are not.
          </li>
          <li>
            <strong>Stay on topic.</strong> Comments should be relevant to what's
            being discussed.
          </li>
          <li>
            <strong>No harassment.</strong> This includes offensive comments
            related to gender, gender identity, age, sexual orientation,
            disability, physical appearance, race, ethnicity, religion, or
            technology choices.
          </li>
          <li>
            <strong>No spam or self-promotion.</strong> Don't post ads, excessive
            links, or promotional content.
          </li>
          <li>
            <strong>Be constructive.</strong> It's fine to share frustrations,
            but if negativity is all you're offering, your comment may be
            removed.
          </li>
          <li>
            <strong>Respect privacy.</strong> Don't share personal information
            about others without their consent.
          </li>
        </ul>

        <h2>What Happens If You Break the Rules</h2>

        <ul>
          <li>Your comment gets removed.</li>
          <li>
            If it's bad enough, you may be blocked without warning.
          </li>
          <li>Repeat violations = permanent block.</li>
        </ul>

        <h2>Reporting Issues</h2>

        <p>
          If you see something that violates these guidelines, use the "Send as
          private feedback" option when leaving a comment, or reach out to the
          site admins directly.
        </p>

        <h2>Privacy Note</h2>

        <p>
          When you submit a comment, we collect your IP address and browser
          information. This is used solely for spam prevention and enforcing
          these guidelines. It's not shared with third parties and is only kept
          as long as needed for moderation.
        </p>

        <hr />

        <p className="text-sm text-harbour-400">
          These guidelines are adapted from the{" "}
          <a
            href="https://ctsnl.ca/conduct/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CTS-NL Code of Conduct
          </a>
          , licensed under{" "}
          <a
            href="http://creativecommons.org/licenses/by/3.0/deed.en_US"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution 3.0
          </a>
          .
        </p>
      </article>
    </div>
  );
}
