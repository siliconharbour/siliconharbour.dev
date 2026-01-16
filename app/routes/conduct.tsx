import type { Route } from "./+types/conduct";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Community Guidelines - siliconharbour.dev" },
    { name: "description", content: "Community guidelines for participating on siliconharbour.dev" },
  ];
}

export default function ConductPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6 prose prose-harbour max-w-none">
        <h1 className="text-3xl font-bold text-harbour-700">Community Guidelines</h1>
        
        <p className="text-harbour-600 text-lg">
          siliconharbour.dev is a community resource for people interested in technology 
          and software development in Newfoundland and Labrador. We want everyone to feel 
          welcome and able to participate constructively.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">Purpose</h2>
          <p className="text-harbour-600">
            This site provides a forum for people who have an interest in software development, 
            technology, and computing to learn about and discuss the local tech community. 
            We want people to feel safe and not have to worry about being insulted, belittled, 
            or feeling dismissed.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">The Quick Version</h2>
          <p className="text-harbour-600">
            This community is dedicated to providing a harassment-free experience for everyone. 
            We do not tolerate harassment in any form. Comments that violate these guidelines 
            will be removed, and repeat offenders may be blocked from participating.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">Guidelines for Comments</h2>
          <ul className="list-disc pl-6 text-harbour-600 space-y-2">
            <li>
              <strong>Be respectful.</strong> Treat others as you would like to be treated. 
              Disagreement is fine; personal attacks are not.
            </li>
            <li>
              <strong>Stay on topic.</strong> Comments should be relevant to the content 
              being discussed.
            </li>
            <li>
              <strong>No harassment.</strong> This includes offensive comments related to 
              gender, gender identity, age, sexual orientation, disability, physical appearance, 
              race, ethnicity, religion, or technology choices.
            </li>
            <li>
              <strong>No spam or self-promotion.</strong> Don't post advertisements, 
              excessive links, or promotional content.
            </li>
            <li>
              <strong>Be constructive.</strong> While it's acceptable to share frustrations, 
              if negativity is all you're offering, your comment may be removed.
            </li>
            <li>
              <strong>Respect privacy.</strong> Don't share personal information about 
              others without their consent.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">What Happens If You Violate These Guidelines</h2>
          <ul className="list-disc pl-6 text-harbour-600 space-y-2">
            <li>Your comment will be removed.</li>
            <li>If the behaviour is judged to be severely harmful, your ability to comment may be restricted without warning.</li>
            <li>Repeat violations will result in a permanent block.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">Reporting Issues</h2>
          <p className="text-harbour-600">
            If you see a comment that violates these guidelines, or have concerns about 
            content on the site, please use the "Send as private feedback" option when 
            leaving a comment, or contact the site administrators directly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-harbour-700 mt-6 mb-3">Privacy Note</h2>
          <p className="text-harbour-600">
            When you submit a comment, we collect your IP address and browser information. 
            This data is used solely for spam prevention and to enforce these community 
            guidelines. It is not shared with third parties and is retained only as long 
            as necessary for moderation purposes.
          </p>
        </section>

        <section className="border-t border-harbour-200 pt-6 mt-6">
          <p className="text-harbour-400 text-sm">
            These guidelines are adapted from the{" "}
            <a 
              href="https://ctsnl.ca/conduct/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-harbour-500 hover:text-harbour-600"
            >
              CTS-NL Code of Conduct
            </a>
            , which is licensed under{" "}
            <a 
              href="http://creativecommons.org/licenses/by/3.0/deed.en_US" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-harbour-500 hover:text-harbour-600"
            >
              Creative Commons Attribution 3.0
            </a>.
          </p>
        </section>
      </article>
    </div>
  );
}
