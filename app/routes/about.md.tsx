import type { Route } from "./+types/about.md";
import { markdownResponse } from "~/lib/markdown.server";

export async function loader({}: Route.LoaderArgs) {
  const content = `---
type: page
title: About siliconharbour.dev
url: https://siliconharbour.dev/about
---

# About siliconharbour.dev

siliconharbour.dev is a community directory for the tech scene in St. John's, Newfoundland and Labrador.

Our goal is to make it easier for people to discover and connect with the local technology community. Whether you're looking for events to attend, companies to work for, meetup groups to join, or just want to learn more about what's happening, this site aims to be a helpful resource.

## Get Involved

If you'd like to add an event, suggest a correction, or contribute in any way, please get in touch with the site's creator, [Jack Harrhy](https://jackharrhy.dev/).

## Contact

For questions, suggestions, or to request / remove a listing, email us at: admin [at] siliconharbour [dot] dev

---

## Frequently Asked Questions

### Who is this for?

This site is primarily for **developers and builders** - people who write code, ship products, and make things. Software engineers, web developers, data scientists, DevOps folks, designers who code, and anyone else who spends their days solving technical problems.

It's less focused on the startup/founder ecosystem, enterprise companies, or students just getting started. Those folks are welcome here, but the focus is more on building software than pitching to investors or learning the basics.

### Why does this exist?

There's a lot happening in the Newfoundland & Labrador tech scene, but it can be hard to 'be in the know'.

Events are scattered across Meetup, LinkedIn, Discord, etc. New people moving to the area, or even people who have been here for a while but aren't as 'online', have no easy way to discover what's on the go.

This site aims to be that central hub - a single place to discover events, companies, groups, and people in our local tech community.

### Who built this?

This site was created by [Jack Harrhy](https://jackharrhy.dev/), a software developer based in St. John's.

### Will this always be kept up to date?

That's the goal! The site is designed to be low-maintenance. It's actually built as a full web application rather than just a collection of markdown files or a WordPress site.

### How can I add my company/event/group?

Email us at admin [at] siliconharbour [dot] dev with the details you'd like listed. Include as much information as possible: name, description, website, logo, and any relevant links.

### How can I remove my listing?

Email us at admin [at] siliconharbour [dot] dev and we'll remove it promptly. No questions asked - we respect your privacy and preferences.

### Is this affiliated with TechNL, Genesis, or any other organization?

No, this is an independent community project. While we reference companies and such from directories like TechNL and Genesis Centre (with appropriate attribution), we're not officially affiliated with any organization.

### Is the site open source?

Yes! The source code is available on [GitHub](https://github.com/siliconharbour/siliconharbour.dev). Contributions, bug reports, and feature suggestions are welcome.

### How is this funded?

Currently, this is a personal project with minimal hosting costs. There are no ads, sponsorships, or paid listings.
`;

  return markdownResponse(content);
}
